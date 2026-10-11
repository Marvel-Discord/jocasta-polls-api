import { createServer } from "node:http";

import { createApp } from "./app";
import "./utils";
import config from "./config";
import { attachPollScheduler } from "./services/pollSchedulerService";
import { moduleLogger } from "./logger";
import { attachBotEventsServer } from "./websocket/botEventsServer";

const logger = moduleLogger("index");

async function startServer() {
  try {
    const app = await createApp();
    const server = createServer(app);
    attachBotEventsServer(server);
    const detachPollScheduler = attachPollScheduler(
      config.scheduler.intervalMs,
      config.scheduler.endLookbackMs,
    );
    server.listen(config.api.port, "0.0.0.0", () => {
      logger.info(`⚡[server]: Server is running on port ${config.api.port}`);
    });
    server.on("close", () => detachPollScheduler());
    logger.info("Server started successfully with persistent sessions");
  } catch (error) {
    logger.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

startServer();
