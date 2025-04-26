import { Router } from "express";

import { pollRouter } from "./poll";
import { tagRouter } from "./tag";

export const apiV1Router = Router();

apiV1Router.use("/polls", pollRouter);
apiV1Router.use("/tags", tagRouter);
