import { Router } from "express";
import type { Response } from "express";

import { ApiError, NotImplementedError } from "@/errors";

export const botDiscordRouter = Router();

const notImplemented = (res: Response) =>
  ApiError.sendError(res, new NotImplementedError());

botDiscordRouter.get("/guilds/:id/channels", (_req, res) =>
  notImplemented(res),
);
botDiscordRouter.get("/guilds/:id/roles", (_req, res) => notImplemented(res));
