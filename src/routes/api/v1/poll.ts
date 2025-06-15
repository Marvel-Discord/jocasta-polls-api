import { ApiError, BadRequestError, NotFoundError } from "@/errors";
import { requireAuth } from "@/middleware/requireAuth";
import {
  type GuildIdParams,
  parseGuildId,
  parsePollFilterParams,
  parsePollId,
  parseUserId,
  parseChoice,
  type PollFilterParams,
  type PollIdParams,
  type UserIdParams,
  VoteParams,
} from "@/models/paramModels";
import { getPollById, getPolls } from "@/services/pollService";
import {
  getVote,
  getVotesByPoll,
  getVotesByUser,
} from "@/services/voteService";
import { attachManagementPermsFlag } from "@/utils/checkDiscordMembership";
import { Router } from "express";

export const pollRouter = Router();

pollRouter.get("/", async (req, res) => {
  try {
    const guildId = await parseGuildId(req.query as unknown as GuildIdParams);
    const { published, tag, userId, notVoted, search, page, limit } =
      await parsePollFilterParams(req.query as unknown as PollFilterParams);

    let hasManagementPerms = false;

    if (published === false) {
      hasManagementPerms = await attachManagementPermsFlag(req);
      if (!hasManagementPerms) {
        throw new ApiError("You cannot view unpublished polls", 403);
      }
    }

    const { data, meta } = await getPolls({
      guildId: guildId,
      published: hasManagementPerms ? published : true,
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
      managementOverride: hasManagementPerms,
    });

    const query = { ...req.query };

    const makePageUrl = (pageNum: number | null) =>
      pageNum
        ? `${req.protocol}://${req.get("host")}${
            req.path
          }?${new URLSearchParams({
            ...query,
            page: pageNum.toString(),
          }).toString()}`
        : undefined;

    meta.nextPageUrl = makePageUrl(meta.nextPage);
    meta.prevPageUrl = makePageUrl(meta.prevPage);

    res.status(200).json({
      data,
      meta,
    });
  } catch (error) {
    ApiError.sendError(res, error);
  }
});

pollRouter.get("/:pollId", async (req, res) => {
  try {
    const pollId = await parsePollId(req.params as PollIdParams);

    const hasManagementPerms = await attachManagementPermsFlag(req);
    const poll = await getPollById(pollId, hasManagementPerms);

    if (!poll || (poll.published === false && !hasManagementPerms)) {
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
    const hasManagementPerms = await attachManagementPermsFlag(req);
    const votes = await getVotesByPoll(pollId, hasManagementPerms);
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

pollRouter.post("/:pollId/vote", requireAuth, async (req, res) => {
  try {
    const pollId = await parsePollId(req.params as unknown as PollIdParams);
    const userId = await parseUserId(req.body as UserIdParams);
    const choice = await parseChoice(req.body as VoteParams);

    const poll = await getPollById(pollId, false);
    if (!poll) {
      throw new NotFoundError(`Poll with id ${pollId} not found`);
    }
    if (choice && choice >= poll.choices.length) {
      throw new BadRequestError(`${choice} is not a valid choice`);
    }

    console.log(
      `User ${userId} is voting for choice ${choice} in poll ${pollId}`
    );
    // TODO: Update vote in DB here

    res.status(201).json({ message: "Vote cast successfully" });
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
