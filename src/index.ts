import { createApp } from "./app";
import "./utils";

async function startServer() {
  try {
    const app = await createApp();
    console.log("Server started successfully with persistent sessions");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
