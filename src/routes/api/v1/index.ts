import { Router } from "express";

import { pollRouter } from "./poll";

export const apiV1Router = Router();

apiV1Router.use("/poll", pollRouter);
