package outreachy.vertx.eventbus.webrtc;

import io.vertx.core.AbstractVerticle;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.bridge.PermittedOptions;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.common.WebEnvironment;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.ext.web.handler.StaticHandler;
import io.vertx.ext.web.handler.sockjs.SockJSBridgeOptions;
import io.vertx.ext.web.handler.sockjs.SockJSHandler;

public class MainVerticle extends AbstractVerticle {

  String broadcastAddress = "webrtc.signaling";

  public static void main(String[] args) {
    System.setProperty("vertxweb.environment", "dev");
    Vertx.vertx()
      .deployVerticle(new MainVerticle())
      .onFailure(err -> {
        err.printStackTrace();
        System.exit(1);
      });
  }
  @Override
  public void start(Promise<Void> startPromise) {

    // 1. register eventbus addresses
    WebRTC wrtc = new WebRTC();
    vertx.eventBus()
      // 2. we will consume JSON objects sent to "webrtc.signaling"
      .<JsonObject>consumer(broadcastAddress)
      .handler(msg -> wrtc.onTestMessage(msg));

    Router router = Router.router(vertx);

    // setup the eventbus sockjs on the server
    router.route("/eventbus/*")
        .handler(BodyHandler.create())
          .subRouter(SockJSHandler.create(vertx)
            .bridge(new SockJSBridgeOptions()
              .addInboundPermitted(new PermittedOptions().setAddressRegex("webrtc\\..*"))
              .addOutboundPermitted(new PermittedOptions().setAddressRegex("webrtc\\..*"))));

    // server static files from "src/main/resources/webroot"
    router.route().handler(StaticHandler.create());

    // start the server
    vertx.createHttpServer()
      .requestHandler(router)
      .listen(8888)
      .onSuccess(server -> {
        startPromise.complete();
        System.out.println("HTTP server started on http://localhost:" + server.actualPort());
      })
      .onFailure(startPromise::fail);
  }
}
