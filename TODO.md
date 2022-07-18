# Actions

Have a look at `WebRTC.java` you can see that we are intercepting the webrtc messages and we can now track all connections
and registrations.

We need to have a custom java class that can hold some extra data:

* socket id
* webrtc id
* List<> webrtc eventbus addresses

This object is constructed in several steps, according to the state, you will collect the right data.

When this is complete we can test that the application will trigger events when a new browser is open/close/refresh/etc.

This will allow you to sync the state.

## Next

We will start receiving lots of messages on the browser so we will work on getting the mesh of connections working.
