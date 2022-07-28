package outreachy.vertx.eventbus.webrtc;

import io.vertx.core.Handler;
import io.vertx.core.eventbus.EventBus;
import io.vertx.ext.web.handler.sockjs.BridgeEvent;

import java.util.ArrayList;
import java.util.List;

public interface WebRTC extends Handler<BridgeEvent> {

  static WebRTC create(EventBus eventBus) {



    return bridgeEvent -> {

      List<PeerState> connections = new ArrayList<>();

      // this bridge event handler will intercept all messages sent to the eventbus
      // the main goal is to keep a list of all peers connected to the eventbus
      // for each peer, we will keep track of all (un)registrations to the eventbus
      switch (bridgeEvent.type()) {
        case SOCKET_CREATED:
          // We can't capture the peerId as this is the low level connection
          // we can however already add this peer to the multimap
          // we need a special holder for {socket.hashcode(), webrtcid, List<registered addresses>}

          // at this moment we add a new element to the peer list
          break;
        case SOCKET_ERROR:
        case SOCKET_CLOSED:
          // when these events occur, we lookup the list by socket.hashcode() and use the eventbus to announce a disconnection/error
          break;
        case SEND:
        case PUBLISH:
          // here we can capture the signaling event. We can lookup the peer element by socket.hashcode() and store the webrtcId
          System.out.println("Message sent from js " + bridgeEvent.getRawMessage());
          break;

        case REGISTER:
          // here we can capture the signaling event. We can lookup the peer element by socket.hashcode() and store the new registration
          break;
        case UNREGISTER:
          // here we can capture the signaling event. We can lookup the peer element by socket.hashcode() and remove the registration
          break;
      }
      bridgeEvent.complete(true);
    };
  }
}
