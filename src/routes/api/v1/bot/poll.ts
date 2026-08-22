import { Router } from "express";
import type { Response } from "express";

import { ApiError, NotImplementedError } from "@/errors";

export const botPollRouter = Router();

const notImplemented = (res: Response) =>
  ApiError.sendError(res, new NotImplementedError());

botPollRouter.get("/sync", (_req, res) => notImplemented(res));
botPollRouter.get("/votes/:userId", (_req, res) => notImplemented(res));
botPollRouter.post("/update-by-tag", (_req, res) => notImplemented(res));
botPollRouter.get("/", (_req, res) => notImplemented(res));
botPollRouter.post("/create", (_req, res) => notImplemented(res));
botPollRouter.post("/update", (_req, res) => notImplemented(res));
botPollRouter.post("/delete", (_req, res) => notImplemented(res));
botPollRouter.get("/:id", (_req, res) => notImplemented(res));
botPollRouter.get("/:id/votes", (_req, res) => notImplemented(res));
botPollRouter.post("/:id/vote", (_req, res) => notImplemented(res));
botPollRouter.post("/:id/publish", (_req, res) => notImplemented(res));
botPollRouter.post("/:id/end", (_req, res) => notImplemented(res));
botPollRouter.post("/:id/crosspost", (_req, res) => notImplemented(res));
