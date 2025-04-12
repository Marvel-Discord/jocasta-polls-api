import { Router } from "express";

export const pollRouter = Router();

pollRouter.get("/", (req, res) => {
	res.status(200).send("Poll endpoint working");
});
