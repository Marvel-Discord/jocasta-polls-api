import { Router } from "express";

import { ApiError, NotImplementedError } from "@/errors";
import { botPollRouter } from "./poll";
import { botTagRouter } from "./tag";
import { botGuildRouter } from "./guild";
import { botDiscordRouter } from "./discord";

export const botRouter = Router();

botRouter.use("/polls", botPollRouter);
botRouter.use("/tags", botTagRouter);
botRouter.use("/guilds", botGuildRouter);
botRouter.use("/discord", botDiscordRouter);
botRouter.get("/events", (_req, res) =>
  ApiError.sendError(res, new NotImplementedError()),
);
