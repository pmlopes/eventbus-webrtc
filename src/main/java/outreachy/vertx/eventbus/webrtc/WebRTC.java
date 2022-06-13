package outreachy.vertx.eventbus.webrtc;

import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonObject;

public class WebRTC {
    public static void onTestMessage(Message<JsonObject> message) {
      // 3. message was received and we are just printing it now
      System.out.println(message.body());
      // 4. we may want to reply. In this case we sent back {"OK", true}
      message
        .reply(new JsonObject()
          .put("OK", true));
    }
}
