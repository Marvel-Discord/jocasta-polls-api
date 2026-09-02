import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";

import { getBotContext } from "@/context/botContext";
import {
  ApiError,
  BadRequestError,
  NotFoundError,
  NotImplementedError,
} from "@/errors";
import { requireDiscordRevalidation } from "@/middleware/requireDiscordRevalidation";
import {
  type GuildIdParams,
  type PollFilterParams,
  type PollIdParams,
  type UserIdParams,
  type VoteParams,
  parseChoice,
  parseGuildId,
  parsePollFilterParams,
  parsePollId,
  parseUserId,
} from "@/models/paramModels";
import {
  createPolls,
  deletePolls,
  getPollById,
  getPolls,
  serializePoll,
  updatePolls,
  updatePollsByTag,
} from "@/services/pollService";
import { castVote, getVotesByPoll, getVotesByUser } from "@/services/voteService";

export const botPollRouter = Router();

const notImplemented = (res: Response) =>
  ApiError.sendError(res, new NotImplementedError());

function pollFilterOptions(params: PollFilterParams) {
  return {
    tag: params.tag,
    ids: params.ids,
    num: params.num,
    active: params.active,
    has_start: params.has_start,
    has_end: params.has_end,
    live: params.live,
    search: params.search,
    page: params.page,
    limit: params.limit,
    order: params.order,
    orderDir: params.orderDir,
    seed: params.seed,
  };
}

// Bot update-by-tag body: the tag plus the whitelisted bulk fields
// (anything else — num, message_id, crosspost_message_ids, tag-targeting
// tricks — is rejected with the offending key names).
const UpdateByTagBody = z
  .object({
    tag: z.number().int().nonnegative(),
    question: z.string().optional(),
    description: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    thread_question: z.string().nullable().optional(),
    show_question: z.boolean().optional(),
    show_options: z.boolean().optional(),
    show_voting: z.boolean().optional(),
    time: z.string().nullable().optional(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
  })
  .strict();

function parseUpdateByTagBody(body: unknown) {
  const parsed = UpdateByTagBody.safeParse(body);
  if (!parsed.success) {
    const unknownKeys = parsed.error.issues
      .filter((issue) => issue.code === "unrecognized_keys")
      .flatMap((issue) => {
        const rec = issue as unknown as Record<string, unknown>;
        const keys =
          (rec.params as { keys?: unknown } | undefined)?.keys ?? rec.keys;
        return Array.isArray(keys) ? (keys as string[]) : [];
      });
    if (unknownKeys.length > 0) {
      throw new BadRequestError(`Unknown fields: ${unknownKeys.join(", ")}`);
    }
    throw new BadRequestError(
      "Invalid update-by-tag body",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

botPollRouter.get("/sync", async (req, res) => {
  const guildId = await parseGuildId(req.query as unknown as GuildIdParams);
  const params = await parsePollFilterParams(
    req.query as unknown as PollFilterParams,
  );
  const { data, meta } = await getPolls({
    guildId,
    ...pollFilterOptions(params),
    managementOverride: true,
  });
  res.status(200).json({ data, meta });
});

botPollRouter.get("/votes/:userId", async (req, res) => {
  const userId = await parseUserId(req.params as UserIdParams);
  const votes = await getVotesByUser(userId);
  res.status(200).json(votes);
});

botPollRouter.post(
  "/update-by-tag",
  requireDiscordRevalidation,
  async (req, res) => {
    const { tag, ...fields } = parseUpdateByTagBody(req.body);
    const updatedPolls = await updatePollsByTag(tag, fields);
    res.status(200).json({
      message: "Polls updated successfully",
      polls: updatedPolls.map((poll) => serializePoll(poll)),
    });
  },
);

botPollRouter.get("/", async (req, res) => {
  const guildId = await parseGuildId(req.query as unknown as GuildIdParams);
  const params = await parsePollFilterParams(
    req.query as unknown as PollFilterParams,
  );
  const { data, meta } = await getPolls({
    guildId,
    published: params.published ?? true,
    ...pollFilterOptions(params),
    managementOverride: getBotContext()?.managementOverride ?? true,
  });
  res.status(200).json({ data, meta });
});

botPollRouter.post("/create", requireDiscordRevalidation, async (req, res) => {
  const createdPolls = await createPolls(req.body);
  res.status(201).json({
    message: "Polls created successfully",
    polls: createdPolls.map((poll) => serializePoll(poll)),
  });
});
botPollRouter.post("/update", requireDiscordRevalidation, async (req, res) => {
  const updatedPolls = await updatePolls(req.body);
  res.status(200).json({
    message: "Polls updated successfully",
    polls: updatedPolls.map((poll) => serializePoll(poll)),
  });
});
botPollRouter.post("/delete", requireDiscordRevalidation, async (req, res) => {
  const deletedPolls = await deletePolls(req.body?.pollIds);
  res.status(200).json({
    message: "Polls deleted successfully",
    deletedCount: deletedPolls.count,
  });
});

botPollRouter.get("/:pollId", async (req, res) => {
  const pollId = await parsePollId(req.params as PollIdParams);
  const poll = await getPollById(
    pollId,
    getBotContext()?.managementOverride ?? true,
  );
  if (!poll) {
    throw new NotFoundError(`Poll with id ${pollId} not found`);
  }
  res.status(200).json(poll);
});

botPollRouter.get("/:pollId/votes", async (req, res) => {
  const pollId = await parsePollId(req.params as PollIdParams);
  const votes = await getVotesByPoll(
    pollId,
    getBotContext()?.managementOverride ?? true,
  );
  res.status(200).json(votes);
});

botPollRouter.post("/:pollId/vote", async (req, res) => {
  const pollId = await parsePollId(req.params as PollIdParams);
  const rawUserId = getBotContext()?.userId;
  if (rawUserId === undefined) {
    throw new BadRequestError(
      "X-Discord-User-Id header is required for voting",
    );
  }
  const choice = await parseChoice(req.body as VoteParams);
  const { votes, total_votes } = await castVote(
    pollId,
    BigInt(rawUserId),
    choice,
  );
  res.status(200).json({ votes, total_votes });
});
botPollRouter.post("/:pollId/publish", (_req, res) => notImplemented(res));
botPollRouter.post("/:pollId/end", (_req, res) => notImplemented(res));
botPollRouter.post("/:pollId/crosspost", (_req, res) => notImplemented(res));
