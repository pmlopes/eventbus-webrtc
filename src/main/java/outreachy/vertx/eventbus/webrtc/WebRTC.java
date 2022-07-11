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
