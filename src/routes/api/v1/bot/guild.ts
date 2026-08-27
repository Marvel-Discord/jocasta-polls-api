import { Router } from "express";
import type { Response } from "express";

import { ApiError, NotImplementedError } from "@/errors";

export const botGuildRouter = Router();

const notImplemented = (res: Response) =>
  ApiError.sendError(res, new NotImplementedError());

botGuildRouter.get("/:id", (_req, res) => notImplemented(res));
