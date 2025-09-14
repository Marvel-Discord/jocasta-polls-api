import cors from "cors";
import express from "express";

import { apiRouter } from "@/routes";
import config from "@/config";
import { createServer } from "node:http";
import { initializeAuth } from "@/auth/passport";

export async function createApp() {
  const app = express();

  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: boolean) => void
    ) => {
      if (!origin || origin === config.frontendUrl) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
  };

  app.use(cors(corsOptions));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.set("trust proxy", 1);

  await initializeAuth(app);

  app.use(apiRouter);

  const server = createServer(app);

  server.listen(config.api.port, "0.0.0.0", () => {
    console.log(`⚡[server]: Server is running on port ${config.api.port}`);
  });

  return {};
}
