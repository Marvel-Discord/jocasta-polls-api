import { Router } from "express";
import type { Response } from "express";

import { ApiError, NotImplementedError } from "@/errors";

export const botTagRouter = Router();

const notImplemented = (res: Response) =>
  ApiError.sendError(res, new NotImplementedError());

botTagRouter.get("/", (_req, res) => notImplemented(res));
botTagRouter.get("/:id", (_req, res) => notImplemented(res));
botTagRouter.post("/create", (_req, res) => notImplemented(res));
botTagRouter.post("/update", (_req, res) => notImplemented(res));
