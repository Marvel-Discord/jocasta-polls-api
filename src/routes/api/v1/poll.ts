import { ApiError, NotFoundError } from "@/errors";
import {
	type GuildIdParams,
	parseGuildId,
	parsePollFilterParams,
	parsePollId,
	type PollFilterParams,
	type PollIdParams,
} from "@/models/paramModels";
import { getPollById, getPolls } from "@/services/pollService";
import { Router } from "express";

export const pollRouter = Router();

pollRouter.get("/", async (req, res) => {
	try {
		const guildId = await parseGuildId(req.query as unknown as GuildIdParams);
		const { published, tag, userId, notVoted } = await parsePollFilterParams(
			req.query as unknown as PollFilterParams,
		);

		const polls = await getPolls({
			guildId: guildId,
			published,
			tag,
			user: userId
				? {
						userId: userId,
						notVoted: notVoted,
					}
				: undefined,
		});

		res.status(200).json(polls);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});

pollRouter.get("/:pollId", async (req, res) => {
	try {
		const pollId = await parsePollId(req.params as PollIdParams);
		const poll = await getPollById(pollId);
		if (!poll) {
			throw new NotFoundError(`Poll with id ${pollId} not found`);
		}
		res.status(200).json(poll);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});
