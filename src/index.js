import { createApp } from "./app.js";

const app = createApp();

app.server.listen(app.config.port, app.config.host, () => {
  app.logger.info("broker_started", {
    host: app.config.host,
    port: app.config.port,
  });
});
