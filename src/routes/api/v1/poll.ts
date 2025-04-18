import { ApiError, NotFoundError } from "@/errors";
import {
	type GuildIdParams,
	parseGuildId,
	parsePollFilterParams,
	parsePollId,
	parseUserId,
	type PollFilterParams,
	type PollIdParams,
	type UserIdParams,
} from "@/models/paramModels";
import { getPollById, getPolls } from "@/services/pollService";
import {
	getVote,
	getVotesByPoll,
	getVotesByUser,
} from "@/services/voteService";
import { Router } from "express";

export const pollRouter = Router();

pollRouter.get("/", async (req, res) => {
	try {
		const guildId = await parseGuildId(req.query as unknown as GuildIdParams);
		const { published, tag, userId, notVoted, search, page, limit } =
			await parsePollFilterParams(req.query as unknown as PollFilterParams);

		if (published === false) {
			// TODO: Add permission check for unpublished polls
			throw new ApiError("Unpublished polls are not available", 403);
		}

		const { data: polls, total } = await getPolls({
			guildId: guildId,
			published,
			tag,
			user: userId
				? {
						userId: userId,
						notVoted: notVoted,
					}
				: undefined,
			search,
			page,
			limit,
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

pollRouter.get("/:pollId/votes", async (req, res) => {
	try {
		const pollId = await parsePollId(req.params as PollIdParams);
		const votes = await getVotesByPoll(pollId);
		res.status(200).json(votes);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});

pollRouter.get("/:pollId/votes/:userId", async (req, res) => {
	try {
		const pollId = await parsePollId(req.params as PollIdParams);
		const userId = await parseUserId(req.params as UserIdParams);
		const vote = await getVote(pollId, userId);
		if (!vote) {
			throw new NotFoundError(`Vote not found for user ${userId}`);
		}
		res.status(200).json(vote);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});

pollRouter.get("/votes/:userId", async (req, res) => {
	try {
		const userId = await parseUserId(req.params as UserIdParams);
		const votes = await getVotesByUser(userId);
		res.status(200).json(votes);
	} catch (error) {
		ApiError.sendError(res, error);
	}
});
