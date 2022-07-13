package outreachy.vertx.eventbus.webrtc;

import io.vertx.core.AbstractVerticle;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonObject;
import java.util.ArrayList;
import java.util.List;

public class WebRTC extends AbstractVerticle {

    static List<String> nodesIds = new ArrayList();
    static EventBus eventBus;

    public WebRTC() {
        eventBus = vertx.eventBus();
    }


    public static void onTestMessage(Message<JsonObject> message) {
      // 3. message was received and we are just printing it now


      // If you're tring to keep the state of the cluster at the signaling side (vert.x) then you need to change the logic
      // in the javascript code.

      // I'm not sure this is the right way. Imagine that the goal of webrtc is to make the cluster resilient to crashes
      // so if the vert.x application crashes or the network fails, the browsers can still work together, if you move
      // the logic here then it won't

      // the vert.x should only care about the initial discovery process.
      try {
          JsonObject body = message.body();
          if(body.getString("type").equals("join")) {
              nodesIds.add(body.getString("webrtcId"));
              // Testing whether they receive
              eventBus.publish("webrtc.signaling", "Hello Received !");
//            // size - 1 because we won't be signaling the last node as it is the incoming node
//                  for(int i=0; i<nodesIds.size()-1; i++) {
//                      // Send notifications to others
//
//                      System.out.println("Message received from js client" + message.body());
//                  }

          }
      }catch(Exception ex) {
          ex.printStackTrace();
      }


      // 4. we may want to reply. In this case we sent back {"OK", true}
      message
        .reply(new JsonObject()
          .put("OK", true));
    }
}
