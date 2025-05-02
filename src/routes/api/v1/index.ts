import { Router } from "express";

import { pollRouter } from "./poll";
import { tagRouter } from "./tag";
import { guildRouter } from "./guild";
import { authRouter } from "./auth";

export const apiV1Router = Router();

apiV1Router.use("/polls", pollRouter);
apiV1Router.use("/tags", tagRouter);
apiV1Router.use("/guilds", guildRouter);
apiV1Router.use("/auth", authRouter);
