import config from "@/config";
import { prisma } from "@/client";
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

    // Check if user already has a vote for this poll
    const existingVote = await prisma.pollsvotes.findFirst({
      where: {
        user_id: BigInt(userId),
        poll_id: pollId,
      },
    });

    // If choice is null/undefined, delete the vote
    if (choice === null || choice === undefined) {
      if (existingVote) {
        await prisma.pollsvotes.deleteMany({
          where: {
            user_id: BigInt(userId),
            poll_id: pollId,
          },
        });
        res.status(200).json({ message: "Vote deleted successfully" });
      } else {
        res.status(200).json({ message: "No vote to delete" });
      }
      return;
    }

    // Validate choice for non-null votes
    if (choice >= poll.choices.length) {
      throw new BadRequestError(`${choice} is not a valid choice`);
    }

    if (existingVote) {
      // Update existing vote
      await prisma.pollsvotes.update({
        where: { id: existingVote.id },
        data: { choice: choice },
      });
      console.log(
        `Updated vote for user ${userId} in poll ${pollId} to choice ${choice}`
      );
    } else {
      // Generate unique vote ID by summing user_id and poll_id
      const voteId = BigInt(userId) + BigInt(pollId);

      // Create new vote
      await prisma.pollsvotes.create({
        data: {
          id: voteId,
          user_id: BigInt(userId),
          poll_id: pollId,
          choice: choice,
        },
      });
      console.log(
        `Created new vote for user ${userId} in poll ${pollId} for choice ${choice}`
      );
    }

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

    // Convert string guild_id to bigint before validation
    const normalizedPollsData = pollsData.map((poll) => ({
      ...poll,
      guild_id:
        typeof poll.guild_id === "string"
          ? BigInt(poll.guild_id)
          : poll.guild_id,
    }));

    normalizedPollsData.forEach((poll) => {
      validatePoll(poll);

      if (poll.guild_id !== config.guildId) {
        throw new ApiError("Cannot create polls for other guilds", 403);
      }

      if (poll.tag !== undefined && !tags.some((tag) => tag.tag === poll.tag)) {
        throw new NotFoundError(`Tag with id ${poll.tag} not found`);
      }
    });

    // Generate unique poll IDs and create polls
    const createdPolls = await Promise.all(
      normalizedPollsData.map(async (poll) => {
        // Generate unique poll ID (matching bot logic)
        let pollId: number;
        while (true) {
          pollId = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
          const existing = await prisma.polls.findUnique({
            where: { id: pollId },
          });
          if (!existing) break;
        }

        return await prisma.polls.create({
          data: {
            id: pollId,
            question: poll.question,
            published: false, // Always false initially like bot
            active: false, // Always false initially like bot
            guild_id: poll.guild_id,
            choices: poll.choices,
            time: null, // Set later when published
            num: null, // Set later when published
            message_id: null, // Set later when published
            crosspost_message_ids: [], // Empty initially
            tag: poll.tag,
            image: poll.image || null,
            description: poll.description || null,
            thread_question: poll.thread_question || null,
            show_question: poll.show_question ?? true,
            show_options: poll.show_options ?? true,
            show_voting: poll.show_voting ?? true,
            fallback: poll.fallback ?? false,
          },
          include: {
            tagRelation: true,
          },
        });
      })
    );

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

    // Convert string guild_id to bigint before validation
    const normalizedPollsData = pollsData.map((poll) => ({
      ...poll,
      guild_id:
        typeof poll.guild_id === "string"
          ? BigInt(poll.guild_id)
          : poll.guild_id,
    }));

    normalizedPollsData.forEach((poll) => {
      validatePoll(poll);

      if (poll.guild_id !== config.guildId) {
        throw new ApiError("Cannot update polls for other guilds", 403);
      }
    });

    const existingPolls = await getPollsFromList(
      normalizedPollsData.map((poll) => poll.id),
      true
    );
    if (existingPolls.length !== normalizedPollsData.length) {
      throw new NotFoundError("One or more polls not found");
    }

    const tags = await getTags();
    normalizedPollsData.forEach((poll) => {
      validatePublishedPoll(poll, existingPolls.find((p) => p.id === poll.id)!);

      if (poll.tag !== undefined && !tags.some((tag) => tag.tag === poll.tag)) {
        throw new NotFoundError(`Tag with id ${poll.tag} not found`);
      }
    });

    // Update polls in database
    const updatedPolls = await Promise.all(
      normalizedPollsData.map(async (poll) => {
        const existingPoll = existingPolls.find((p) => p.id === poll.id);
        if (!existingPoll) {
          throw new NotFoundError(`Poll with id ${poll.id} not found`);
        }

        return await prisma.polls.update({
          where: { id: poll.id },
          data: {
            question: poll.question,
            guild_id: poll.guild_id,
            choices: poll.choices,
            tag: poll.tag,
            image: poll.image,
            description: poll.description,
            thread_question: poll.thread_question,
            show_question: poll.show_question,
            show_options: poll.show_options,
            show_voting: poll.show_voting,
            fallback: poll.fallback,
            // Only update these if provided (preserve existing values otherwise)
            ...(poll.time && { time: new Date(poll.time) }),
            ...(poll.num !== undefined && { num: poll.num }),
            ...(poll.message_id && { message_id: BigInt(poll.message_id) }),
            ...(poll.crosspost_message_ids && {
              crosspost_message_ids: poll.crosspost_message_ids.map((id) =>
                BigInt(id)
              ),
            }),
            ...(poll.active !== undefined && { active: poll.active }),
            // Preserve published state from existing poll
            published: existingPoll.published,
          },
          include: {
            tagRelation: true,
          },
        });
      })
    );
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

    // Delete polls and related votes from database
    await prisma.$transaction(async (tx) => {
      // First delete all votes for these polls
      await tx.pollsvotes.deleteMany({
        where: {
          poll_id: {
            in: pollIds.map(Number),
          },
        },
      });

      // Then delete the polls
      const deletedPolls = await tx.polls.deleteMany({
        where: {
          id: {
            in: pollIds.map(Number),
          },
        },
      });

      if (deletedPolls.count === 0) {
        throw new NotFoundError("No polls found with the provided IDs");
      }

      console.log(
        `Deleted ${deletedPolls.count} polls with IDs: ${pollIds.join(", ")}`
      );
      return deletedPolls;
    });

    res.status(200).json({
      message: "Polls deleted successfully",
      deletedCount: pollIds.length,
    });
  } catch (error) {
    ApiError.sendError(res, error);
  }
});
