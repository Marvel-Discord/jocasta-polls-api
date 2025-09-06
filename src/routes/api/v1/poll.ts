import config from "@/config";
import { ApiError, BadRequestError, NotFoundError } from "@/errors";
import { requireAuth, requireManagementPerms } from "@/middleware/requireAuth";
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
import {
  getPollById,
  getPolls,
  getPollsFromList,
} from "@/services/pollService";
import { getTags } from "@/services/tagService";
import {
  getVote,
  getVotesByPoll,
  getVotesByUser,
} from "@/services/voteService";
import { Poll } from "@/types";
import { attachManagementPermsFlag } from "@/utils/checkDiscordMembership";
import { validatePoll, validatePublishedPoll } from "@/utils/validatePoll";
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

    res.status(200).json({ message: "Vote cast successfully" });
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

pollRouter.post("/create", requireManagementPerms, async (req, res) => {
  try {
    const pollsData = req.body as Poll[];

    if (!Array.isArray(pollsData) || pollsData.length === 0) {
      throw new BadRequestError("pollsData must be a non-empty array");
    }

    const tags = await getTags();

    pollsData.forEach((poll) => {
      validatePoll(poll);

      if (poll.guild_id !== config.guildId) {
        throw new ApiError("Cannot create polls for other guilds", 403);
      }

      if (poll.tag !== undefined && !tags.some((tag) => tag.tag === poll.tag)) {
        throw new NotFoundError(`Tag with id ${poll.tag} not found`);
      }
    });

    // TODO: Implement actual creation logic here
    const createdPolls = pollsData.map((poll) => ({
      // Mock creation logic
      ...poll,
      id: Math.floor(Math.random() * 10000), // Mock ID generation
      published: false, // Default to unpublished
    }));

    console.log(
      `Created ${createdPolls.length} polls: ${createdPolls
        .map((p) => `"${p.question}"`)
        .join(", ")}`
    );
    res.status(201).json({
      message: "Polls created successfully",
      polls: createdPolls,
    });
  } catch (error) {
    ApiError.sendError(res, error);
  }
});

pollRouter.post("/update", requireManagementPerms, async (req, res) => {
  try {
    const pollsData = req.body as Poll[];

    if (!Array.isArray(pollsData) || pollsData.length === 0) {
      throw new BadRequestError("pollsData must be a non-empty array");
    }

    pollsData.forEach((poll) => {
      validatePoll(poll);

      if (poll.guild_id !== config.guildId) {
        throw new ApiError("Cannot update polls for other guilds", 403);
      }
    });

    const existingPolls = await getPollsFromList(
      pollsData.map((poll) => poll.id),
      true
    );
    if (existingPolls.length !== pollsData.length) {
      throw new NotFoundError("One or more polls not found");
    }

    const tags = await getTags();
    pollsData.forEach((poll) => {
      validatePublishedPoll(poll, existingPolls.find((p) => p.id === poll.id)!);

      if (poll.tag !== undefined && !tags.some((tag) => tag.tag === poll.tag)) {
        throw new NotFoundError(`Tag with id ${poll.tag} not found`);
      }
    });

    // TODO: Implement actual update logic here
    const updatedPolls = pollsData.map((poll) => {
      const existingPoll = existingPolls.find((p) => p.id === poll.id);
      if (!existingPoll) {
        throw new NotFoundError(`Poll with id ${poll.id} not found`);
      }
      return {
        ...existingPoll,
        ...poll,
        published: existingPoll.published, // Preserve published state
      };
    });
    console.log(
      `Updated ${updatedPolls.length} polls: ${updatedPolls
        .map((p) => `"${p.question}"`)
        .join(", ")}`
    );
    res.status(200).json({
      message: "Polls updated successfully",
      polls: updatedPolls,
    });
  } catch (error) {
    ApiError.sendError(res, error);
    return;
  }
});

pollRouter.post("/delete", requireManagementPerms, async (req, res) => {
  try {
    const pollIds = req.body.pollIds as string[];
    if (!Array.isArray(pollIds) || pollIds.length === 0) {
      throw new BadRequestError("pollIds must be a non-empty array");
    }

    // fetches the polls to ensure they exist and the user has permission to delete them
    const polls = await getPollsFromList(pollIds.map(Number), true);
    if (polls.length !== pollIds.length) {
      throw new NotFoundError("One or more polls not found");
    }

    if (polls.some((poll) => poll.published)) {
      throw new ApiError("Cannot delete published polls", 403);
    }

    if (polls.some((poll) => poll.guild_id !== config.guildId)) {
      throw new ApiError("Cannot delete polls from other guilds", 403);
    }

    // TODO: Implement actual deletion logic here
    console.log(`Deleting polls with IDs: ${pollIds.join(", ")}`);
    res.status(200).json({ message: "Polls deleted successfully" });
  } catch (error) {
    ApiError.sendError(res, error);
  }
});
