import { Router } from "express";

import { pollRouter } from "./poll";
import { tagRouter } from "./tag";
import { guildRouter } from "./guild";

export const apiV1Router = Router();

apiV1Router.use("/polls", pollRouter);
apiV1Router.use("/tags", tagRouter);
apiV1Router.use("/guilds", guildRouter);
