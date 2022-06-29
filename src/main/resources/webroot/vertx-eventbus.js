/*
 *   Copyright (c) 2011-2015 The original author or authors
 *   ------------------------------------------------------
 *   All rights reserved. This program and the accompanying materials
 *   are made available under the terms of the Eclipse Public License v1.0
 *   and Apache License v2.0 which accompanies this distribution.
 *
 *       The Eclipse Public License is available at
 *       http://www.eclipse.org/legal/epl-v10.html
 *
 *       The Apache License v2.0 is available at
 *       http://www.opensource.org/licenses/apache2.0.php
 *
 *   You may elect to redistribute this code under either of these licenses.
 */
!function (factory) {
  if (typeof require === 'function' && typeof module !== 'undefined') {
    // CommonJS loader
    var SockJS = require('sockjs-client');
    if (!SockJS) {
      throw new Error('vertx-eventbus.js requires sockjs-client, see http://sockjs.org');
    }
    factory(SockJS);
  } else if (typeof define === 'function' && define.amd) {
    // AMD loader
    define('vertx-eventbus', ['sockjs'], factory);
  } else {
    // plain old include
    if (typeof this.SockJS === 'undefined') {
      throw new Error('vertx-eventbus.js requires sockjs-client, see http://sockjs.org');
    }

    EventBus = factory(this.SockJS);
  }
}(function (SockJS) {

  function makeUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (a, b) {
      return b = Math.random() * 16, (a == 'y' ? b & 3 | 8 : b | 0).toString(16);
    });
  }

  function mergeHeaders(defaultHeaders, headers) {
    if (defaultHeaders) {
      if (!headers) {
        return defaultHeaders;
      }

      for (var headerName in defaultHeaders) {
        if (defaultHeaders.hasOwnProperty(headerName)) {
          // user can overwrite the default headers
          if (typeof headers[headerName] === 'undefined') {
            headers[headerName] = defaultHeaders[headerName];
          }
        }
      }
    }

    // headers are required to be a object
    return headers || {};
  }

  /**
   * EventBus
   *
   * @param url
   * @param options
   * @constructor
   */
  var EventBus = function (url, options) {

    var self = this;

    options = options || {};

    // attributes
    this.pingInterval = options.vertxbus_ping_interval || 5000;
    this.pingTimerID = null;

    this.reconnectEnabled = false;
    this.reconnectAttempts = 0;
    this.reconnectTimerID = null;
    // adapted from backo
    this.maxReconnectAttempts = options.vertxbus_reconnect_attempts_max || Infinity;
    this.reconnectDelayMin = options.vertxbus_reconnect_delay_min || 1000;
    this.reconnectDelayMax = options.vertxbus_reconnect_delay_max || 5000;
    this.reconnectExponent = options.vertxbus_reconnect_exponent || 2;
    this.randomizationFactor = options.vertxbus_randomization_factor || 0.5;
    var getReconnectDelay = function() {
          var ms = self.reconnectDelayMin * Math.pow(self.reconnectExponent, self.reconnectAttempts);
      if (self.randomizationFactor) {
        var rand =  Math.random();
        var deviation = Math.floor(rand * self.randomizationFactor * ms);
        ms = (Math.floor(rand * 10) & 1) === 0  ? ms - deviation : ms + deviation;
      }
        return Math.min(ms, self.reconnectDelayMax) | 0;
    };

    this.defaultHeaders = null;

    // default event handlers
    this.onerror = function (err) {
      try {
        console.error(err);
      } catch (e) {
        // dev tools are disabled so we cannot use console on IE
      }
    };

    this.onevent = function (event, message) {
      return false; // return false to signal that this message is not processed
    };

    this.onunhandled = function (json) {
      try {
        if (json.type === 'err')
          self.onerror(json);
        else if (json.event) {
          console.warn('No handler found for event: %o. Message: %O', json.event, json);
        } else {
          console.warn('No handler found for message: ', json);
        }
      } catch (e) {
        // dev tools are disabled so we cannot use console on IE
      }
    };

    // TODO: this is a timer function, for this reason it should not be async as async means it can only called once
    //       as a timer function it can be called multiple times
    var setupSockJSConnection = async function () {

      return new Promise((resolve, reject) => {

          self.sockJSConn = new SockJS(url, null, options);
      self.state = EventBus.CONNECTING;

      // handlers and reply handlers are tied to the state of the socket
      // they are added onopen or when sending, so reset when reconnecting
      self.handlers = {};
      self.replyHandlers = {};

      self.sockJSConn.onopen = function () {
        self.enablePing(true);
        self.state = EventBus.OPEN;
        self.onopen && self.onopen();
        if (self.reconnectTimerID) {
          self.reconnectAttempts = 0;
          // fire separate event for reconnects
          // consistent behavior with adding handlers onopen
          self.onreconnect && self.onreconnect();
        }
      };

      self.sockJSConn.onclose = function (e) {
        self.state = EventBus.CLOSED;
        if (self.pingTimerID) clearInterval(self.pingTimerID);
        if (self.reconnectEnabled && self.reconnectAttempts < self.maxReconnectAttempts) {
          self.sockJSConn = null;
          // set id so users can cancel
          self.reconnectTimerID = setTimeout(setupSockJSConnection, getReconnectDelay());
          ++self.reconnectAttempts;
        }
        self.onclose && self.onclose(e);
      };

      self.sockJSConn.onmessage = function (e) {
        var json;

        try {
          json = JSON.parse(e.data);
        } catch(ex) {
          json = {
            type: 'err',
            failureType: ex.toString(),
            message: e.data
          };
        }

        // define a reply function on the message itself
        if (json.replyAddress) {
          Object.defineProperty(json, 'reply', {
            value: function (message, headers, callback) {
              self.send(json.replyAddress, message, headers, callback);
            }
          });
        }

        if (self.handlers[json.address]) {
          // iterate all registered handlers
          var handlers = self.handlers[json.address];
          for (var i = 0; i < handlers.length; i++) {
            if (json.type === 'err') {
              handlers[i]({ failureCode: json.failureCode, failureType: json.failureType, message: json.message });
            } else {
              handlers[i](null, json);
            }
          }
        } else if (self.replyHandlers[json.address]) {
          // Might be a reply message
          var handler = self.replyHandlers[json.address];
          delete self.replyHandlers[json.address];
          if (json.type === 'err') {
            handler({ failureCode: json.failureCode, failureType: json.failureType, message: json.message });
          } else {
            handler(null, json);
          }
        } else {
          if (!json.event || !self.onevent(json.event, json.message)) {
            self.onunhandled(json);
          }
        }
      };
      resolve();
      });
    };

    // function cannot be anonymous and self-calling due to pseudo-recursion
    setupSockJSConnection();
  };

  /**
   * Send a message
   *
   * @param {String} address
   * @param {Object} message
   * @param {Object} [headers]
   * @param {Function} [callback]
   */
  // TODO: as we are returning a Promise we don't need to demark the function as async
  //       as we return a Promise we can remove the last argument
    EventBus.prototype.send = async function (address, message, headers, callback) {
        // are we ready?
        return new Promise((resolve, reject) => {
            if (this.state !== EventBus.OPEN) {
              // TODO: the reject is correct here, but we should still have a Error type and return, otherwise
              //       we introduce a bug as code contines to execute after an error was thrown
                reject('INVALID_STATE_ERR');
//          throw new Error('INVALID_STATE_ERR');
            }

            // TODO: if the callback is removed, this statement doesn't do anything anymore
            //       this was to handle the case of optional arguments.
            if (typeof headers === 'function') {
                callback = headers;
                headers = {};
            }

            var envelope = {
                type: 'send',
                address: address,
                headers: mergeHeaders(this.defaultHeaders, headers),
                body: message
            };

            if (callback) {
                var replyAddress = makeUUID();
                envelope.replyAddress = replyAddress;
                // TODO: here is a challenge, the replyHandlers needs to hold both the {reject, resolve} functions
                this.replyHandlers[replyAddress] = callback;
            }

            this.sockJSConn.send(JSON.stringify(envelope));
            // TODO: this is incorrect, the promise only resolves once a message is received
            //       that happens above
            resolve();
        });
    };

  /**
   * Publish a message
   *
   * @param {String} address
   * @param {Object} message
   * @param {Object} [headers]
   */
  // TODO: you need to apply the same ideas shared in the comments on the send function here too!
  EventBus.prototype.publish = async function (address, message, headers) {
    // are we ready?
    return new Promise((resolve, reject) => {
        if (this.state !== EventBus.OPEN) {
//          throw new Error('INVALID_STATE_ERR');
            reject('INVALID_STATE_ERR');
        }

       this.sockJSConn.send(JSON.stringify({
       type: 'publish',
       address: address,
        headers: mergeHeaders(this.defaultHeaders, headers),
      body: message
    })
            );
    resolve();
    });
  };

  /**
   * Register a new handler
   *
   * @param {String} address
   * @param {Object} [headers]
   * @param {Function} callback
   */
  // TODO: you need to apply the same ideas shared in the comments on the send function here too!
  EventBus.prototype.registerHandler = async function (address, headers, callback) {
    // are we ready?
    return new Promise((resolve, reject) => {
        if (this.state !== EventBus.OPEN) {
        reject('INVALID_STATE_ERR');
//      throw new Error('INVALID_STATE_ERR');
    }

    if (typeof headers === 'function') {
      callback = headers;
      headers = {};
    }

    // ensure it is an array
    if (!this.handlers[address]) {
      this.handlers[address] = [];
      // First handler for this address so we should register the connection
      this.sockJSConn.send(JSON.stringify({
        type: 'register',
        address: address,
        headers: mergeHeaders(this.defaultHeaders, headers)
      }));
    }

    this.handlers[address].push(callback);

    resolve();
    });
  };

  /**
   * Unregister a handler
   *
   * @param {String} address
   * @param {Object} [headers]
   * @param {Function} callback
   */
  // TODO: you need to apply the same ideas shared in the comments on the send function here too!
  EventBus.prototype.unregisterHandler = async function (address, headers, callback) {
    // are we ready?
    return new Promise((resolve, reject) => {

        if (this.state !== EventBus.OPEN) {
 //      throw new Error('INVALID_STATE_ERR');
            reject('INVALID_STATE_ERR');
        }

    var handlers = this.handlers[address];

    if (handlers) {

      if (typeof headers === 'function') {
        callback = headers;
        headers = {};
      }

      var idx = handlers.indexOf(callback);
      if (idx !== -1) {
        handlers.splice(idx, 1);
        if (handlers.length === 0) {
          // No more local handlers so we should unregister the connection
          this.sockJSConn.send(JSON.stringify({
            type: 'unregister',
            address: address,
            headers: mergeHeaders(this.defaultHeaders, headers)
          }));

          delete this.handlers[address];
        }
      }
    }
    resolve();
    });
  };

  /**
   * Closes the connection to the EventBus Bridge,
   * preventing any reconnect attempts
   */
  // TODO: you need to apply the same ideas shared in the comments on the send function here too!
  EventBus.prototype.close = async function () {
    return new Promise((resolve, reject) => {
        this.state = EventBus.CLOSING;
        this.enableReconnect(false);
        this.sockJSConn.close();
        resolve();
    });
  };

  EventBus.CONNECTING = 0;
  EventBus.OPEN = 1;
  EventBus.CLOSING = 2;
  EventBus.CLOSED = 3;

  // TODO: this function is not asynchenous, but it should not be "async"
  //       as a rule of thumb, all functions that didn't receive a callback are not asynchronous
  //       in this case they should remain as is
  EventBus.prototype.enablePing = async function (enable) {

    return new Promise((resolve, reject) => {
        var self = this;

    if (enable) {
      var sendPing = function () {
        self.sockJSConn.send(JSON.stringify({ type: 'ping' }));
      };

      if (self.pingInterval > 0) {
        // Send the first ping then send a ping every pingInterval milliseconds
        sendPing();
        self.pingTimerID = setInterval(sendPing, self.pingInterval);
      }
    } else {
      if (self.pingTimerID) {
        clearInterval(self.pingTimerID);
        self.pingTimerID = null;
      }
    }
    resolve();
    });
  };

  // TODO: same comments as above apply here
  EventBus.prototype.enableReconnect = async function (enable) {
    return new Promise((resolve, reject) => {
        var self = this;

    self.reconnectEnabled = enable;
    if (!enable && self.reconnectTimerID) {
      clearTimeout(self.reconnectTimerID);
      self.reconnectTimerID = null;
      self.reconnectAttempts = 0;
    }
    resolve();
    });
  };

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = EventBus;
    } else {
      exports.EventBus = EventBus;
    }
  } else {
    return EventBus;
  }
});
