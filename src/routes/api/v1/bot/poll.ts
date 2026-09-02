import { Router } from "express";
import type { Response } from "express";

import { getBotContext } from "@/context/botContext";
import {
  ApiError,
  NotFoundError,
  NotImplementedError,
} from "@/errors";
import {
  type GuildIdParams,
  type PollFilterParams,
  type PollIdParams,
  type UserIdParams,
  parseGuildId,
  parsePollFilterParams,
  parsePollId,
  parseUserId,
} from "@/models/paramModels";
import { getPollById, getPolls } from "@/services/pollService";
import { getVotesByPoll, getVotesByUser } from "@/services/voteService";

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

botPollRouter.post("/update-by-tag", (_req, res) => notImplemented(res));

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

botPollRouter.post("/create", (_req, res) => notImplemented(res));
botPollRouter.post("/update", (_req, res) => notImplemented(res));
botPollRouter.post("/delete", (_req, res) => notImplemented(res));

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

botPollRouter.post("/:pollId/vote", (_req, res) => notImplemented(res));
botPollRouter.post("/:pollId/publish", (_req, res) => notImplemented(res));
botPollRouter.post("/:pollId/end", (_req, res) => notImplemented(res));
botPollRouter.post("/:pollId/crosspost", (_req, res) => notImplemented(res));
