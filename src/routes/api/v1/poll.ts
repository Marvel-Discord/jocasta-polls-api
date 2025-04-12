import { ApiError } from "@/errors";
import { getPolls } from "@/services/pollService";
import { Router } from "express";

export const pollRouter = Router();

pollRouter.get("/", async (req, res) => {
	try {
		const polls = await getPolls();
		res.status(200).json(polls);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});
