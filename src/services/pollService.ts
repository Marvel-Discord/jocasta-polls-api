import { Prisma, type Poll as PollModel } from "@/generated/prisma/client";

import config from "@/config";
import { prisma } from "@/client";
import { ApiError, BadRequestError, NotFoundError } from "@/errors";
import { getTags } from "@/services/tagService";
import type { Meta, Poll } from "@/types";
import { OrderDir, OrderType } from "@/types";
import {
  type PollTimeInput,
  type PollWriteInput,
  coerceDate,
  resolveStartTime,
  validatePoll,
  validatePublishedPoll,
} from "@/utils/validatePoll";

/**
 * User filtering options for polls
 */
export interface PollFilterUser {
  userId: bigint;
  notVoted?: boolean;
}

/**
 * Comprehensive filtering and pagination options for poll queries
 */
interface PollFilters {
  guildId: bigint;
  published?: boolean;
  tag?: number;
  ids?: number[];
  num?: number;
  active?: boolean;
  has_start?: boolean;
  has_end?: boolean;
  live?: boolean;
  user?: PollFilterUser;
  search?: string;
  page?: number;
  limit?: number;
  managementOverride?: boolean; // Overrides hidden votes visibility
  order?: OrderType;
  orderDir?: OrderDir;
  seed?: number;
}

/**
 * Extended poll type that includes vote relation data for processing
 */
export type PollWithVotes = PollModel & {
  votes: { choice: number }[];
  tagRelation?: unknown;
};

// ===== UTILITY FUNCTIONS =====

/**
 * Sanitizes search input for safe use in database queries
 */
function sanitizeSearchInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/([&|!()"'`])/g, "\\$1") // Escape special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .split(" ")
    .filter(Boolean) // Remove empty strings
    .join(" ");
}

/**
 * Creates pagination metadata for API responses
 */
function createPaginationMeta(
  total: number,
  page: number,
  limit: number,
  randomSeed?: number
): Meta {
  const totalPages = Math.ceil(total / limit);
  const nextPage = page < totalPages ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  return {
    total,
    page,
    limit,
    totalPages,
    nextPage,
    prevPage,
    ...(randomSeed !== undefined ? { randomSeed } : {}),
  };
}

/**
 * Derives poll activity from timestamps: a poll is active when it is
 * published, has started, and has not ended. Open-ended polls (NULL
 * end_time) stay active once started. At `now === end_time` exactly the
 * poll is inactive.
 */
export function computeActive(
  poll: Pick<PollModel, "published" | "start_time" | "end_time">,
  now: Date = new Date(),
): boolean {
  return (
    poll.published &&
    poll.start_time !== null &&
    poll.start_time <= now &&
    (poll.end_time === null || poll.end_time > now)
  );
}

/**
 * Serializes a poll with its vote relation into the API contract shape:
 * tallies votes per choice, emits start_time/end_time, derives `active`
 * from the timestamps (the model no longer stores it), and keeps time as
 * the compatibility alias for start_time (website; removable post-migration)
 */
export function serializePoll(poll: PollWithVotes, now: Date = new Date()): Poll {
  const { votes, start_time, end_time, tagRelation, ...restPoll } = poll;
  const totalVotes = votes.length;
  const voteCounts = new Array<number>(restPoll.choices.length).fill(0);
  for (const vote of votes) {
    if (vote.choice >= 0 && vote.choice < voteCounts.length) {
      voteCounts[vote.choice] += 1;
    }
  }
  return {
    ...restPoll,
    active: computeActive(poll, now),
    votes: voteCounts,
    total_votes: totalVotes,
    start_time,
    end_time,
    time: start_time,
  };
}

// ===== QUERY BUILDERS =====

/**
 * Builds Prisma where conditions for poll filtering
 */
function buildPollFilters(options: {
  published?: boolean;
  guildId: bigint;
  tag?: number;
  user?: PollFilterUser;
  searchQuery?: string;
}) {
  const { published, guildId, tag, user, searchQuery } = options;

  return {
    published,
    guild_id: guildId,
    ...(tag !== undefined ? { tag } : {}),
    ...(user
      ? {
          votes: user.notVoted
            ? { none: { user_id: user.userId } }
            : { some: { user_id: user.userId } },
        }
      : {}),
    ...(searchQuery
      ? {
          OR: [
            {
              question: {
                contains: searchQuery,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              description: {
                contains: searchQuery,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            { choices: { has: searchQuery } },
          ],
        }
      : {}),
  } as any;
}

/**
 * Builds the derived-active where fragment: published, started, and not
 * ended (open-ended polls count as not ended). One helper, two consumers:
 * the `active` filter and the derived arm of the `live` filter.
 */
function derivedActiveWhere(now: Date): Prisma.PollWhereInput {
  return {
    published: true,
    start_time: { lte: now },
    OR: [{ end_time: null }, { end_time: { gt: now } }],
  };
}

/**
 * Builds the bot-facing aux list filters (ids, num, active, has_start,
 * has_end, live) as an array of conjuncts for AND-appending. Pure — no DB
 * access — so it can be unit tested directly and composed into the list
 * path's filters object. Each conjunct is self-contained: no fragment ever
 * writes a top-level OR into the shared filters.
 */
export function buildPollAuxFilters(
  params: {
    ids?: number[];
    num?: number;
    active?: boolean;
    has_start?: boolean;
    has_end?: boolean;
    live?: boolean;
  },
  now: Date = new Date(),
): Prisma.PollWhereInput[] {
  const conjuncts: Prisma.PollWhereInput[] = [];
  if (params.ids?.length) conjuncts.push({ id: { in: params.ids } });
  if (params.num !== undefined) conjuncts.push({ num: params.num });
  if (params.active === true) conjuncts.push(derivedActiveWhere(now));
  else if (params.active === false)
    conjuncts.push({ NOT: derivedActiveWhere(now) });
  if (params.has_start === true) conjuncts.push({ start_time: { not: null } });
  else if (params.has_start === false) conjuncts.push({ start_time: null });
  if (params.has_end === true) conjuncts.push({ end_time: { not: null } });
  else if (params.has_end === false) conjuncts.push({ end_time: null });
  if (params.live === true) {
    conjuncts.push({
      OR: [derivedActiveWhere(now), { tagRelation: { persistent: true } }],
    });
  }
  return conjuncts;
}

/**
 * Gets poll IDs that a user has voted on, with optional filtering
 */
async function getUserVotedPollIds(user?: PollFilterUser) {
  if (!user) return null;

  const votedPolls = await prisma.vote.findMany({
    where: { user_id: user.userId },
    select: { poll_id: true },
  });

  const votedIds = votedPolls.map((v) => v.poll_id);

  if (user.notVoted) {
    return votedIds.length > 0
      ? { filter: { id: { notIn: votedIds } }, isEmpty: false }
      : { filter: {}, isEmpty: false };
  }

  return votedIds.length === 0
    ? { isEmpty: true }
    : { filter: { id: { in: votedIds } }, isEmpty: false };
}

/**
 * Determines the sort order direction
 */
function getOrderDirection(orderDir?: OrderDir): "asc" | "desc" {
  return orderDir === OrderDir.Asc ? "asc" : "desc";
}

// ===== MAIN SERVICE FUNCTIONS =====

/**
 * Retrieves polls with filtering, pagination, and sorting options
 */
export async function getPolls({
  guildId,
  published,
  tag,
  ids,
  num,
  active,
  has_start,
  has_end,
  live,
  user,
  search,
  page = 1,
  limit = 10,
  managementOverride = false,
  order = OrderType.Time,
  orderDir,
  seed,
}: PollFilters): Promise<{ data: Poll[]; meta: Meta }> {
  const now = new Date();
  const searchQuery = search ? sanitizeSearchInput(search) : undefined;
  const filters = buildPollFilters({
    published,
    guildId,
    tag,
    user,
    searchQuery,
  });
  const conjuncts = buildPollAuxFilters(
    {
      ids,
      num,
      active,
      has_start,
      has_end,
      live,
    },
    now,
  );
  // Conjunct-array composition: aux filters are AND-appended so no
  // fragment ever writes a top-level OR into the shared filters.
  filters.AND = [...((filters.AND as unknown[]) ?? []), ...conjuncts];

  // Get total count for pagination
  const total = await prisma.poll.count({ where: filters });

  let data: Poll[] = [];
  let randomSeed: number | undefined = undefined;

  if (order === OrderType.Votes || order === OrderType.Random) {
    const result = await handleSpecialOrderingQueries({
      filters,
      user,
      order,
      orderDir,
      page,
      limit,
      guildId,
      published,
      tag,
      searchQuery,
      ids,
      seed,
      now,
    });

    data = result.data;
    randomSeed = result.randomSeed;
  } else {
    // Standard time-based ordering
    data = await handleTimeOrderedQuery({
      filters,
      page,
      limit,
      orderDir,
      now,
    });
  }

  const meta = createPaginationMeta(total, page, limit, randomSeed);
  const processedData = processDataForVisibility(data, managementOverride);

  return { data: processedData, meta };
}

/**
 * Handles vote count and random ordering queries that require special processing
 */
async function handleSpecialOrderingQueries({
  filters,
  user,
  order,
  orderDir,
  page,
  limit,
  guildId,
  published,
  tag,
  searchQuery,
  ids,
  seed,
  now,
}: {
  filters: any;
  user?: PollFilterUser;
  order: OrderType;
  orderDir?: OrderDir;
  page: number;
  limit: number;
  guildId: bigint;
  published?: boolean;
  tag?: number;
  searchQuery?: string;
  ids?: number[];
  seed?: number;
  now: Date;
}): Promise<{ data: Poll[]; randomSeed?: number }> {
  const offset = (page - 1) * limit;

  // Apply user voting filters
  const userFilter = await getUserVotedPollIds(user);
  if (userFilter?.isEmpty) {
    return { data: [] };
  }
  if (userFilter?.filter) {
    Object.assign(filters, userFilter.filter);
  }

  if (order === OrderType.Votes) {
    return await handleVoteOrderedQuery({
      filters,
      limit,
      offset,
      orderDir,
      now,
    });
  } else {
    return await handleRandomOrderedQuery({
      guildId,
      published,
      tag,
      searchQuery,
      ids,
      filters,
      limit,
      offset,
      seed,
      now,
    });
  }
}

/**
 * Handles vote count ordering with database-level count sorting
 */
async function handleVoteOrderedQuery({
  filters,
  limit,
  offset,
  orderDir,
  now,
}: {
  filters: any;
  limit: number;
  offset: number;
  orderDir?: OrderDir;
  now: Date;
}): Promise<{ data: Poll[] }> {
  const polls = await prisma.poll.findMany({
    where: filters,
    take: limit,
    skip: offset,
    orderBy: {
      votes: { _count: getOrderDirection(orderDir) },
    },
    include: {
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  return { data: polls.map((poll) => serializePoll(poll, now)) };
}

/**
 * Handles random ordering using database-level randomization
 */
async function handleRandomOrderedQuery({
  guildId,
  published,
  tag,
  searchQuery,
  ids,
  filters,
  limit,
  offset,
  seed,
  now,
}: {
  guildId: bigint;
  published?: boolean;
  tag?: number;
  searchQuery?: string;
  ids?: number[];
  filters: any;
  limit: number;
  offset: number;
  seed?: number;
  now: Date;
}): Promise<{ data: Poll[]; randomSeed: number }> {
  const randomSeed =
    typeof seed === "number"
      ? seed
      : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  const pollIds: { id: number }[] = await prisma.$queryRaw(
    Prisma.sql`
      SELECT id FROM polls
      WHERE guild_id = ${guildId}
      ${published ? Prisma.sql`AND published = ${published}` : Prisma.empty}
      ${tag !== undefined ? Prisma.sql`AND tag = ${tag}` : Prisma.empty}
      ${
        searchQuery
          ? Prisma.sql`AND (question ILIKE ${`%${searchQuery}%`} OR description ILIKE ${`%${searchQuery}%`} OR EXISTS (SELECT 1 FROM unnest(choices) ch WHERE ch ILIKE ${`%${searchQuery}%`}))`
          : Prisma.empty
      }
      ${
        ids?.length
          ? Prisma.sql`AND id = ANY(${ids})`
          : Prisma.empty
      }
      ${
        filters.id
          ? filters.id.in
            ? Prisma.sql`AND id = ANY(${filters.id.in})`
            : Prisma.sql`AND id NOT IN (${Prisma.join(filters.id.notIn)})`
          : Prisma.empty
      }
      ORDER BY md5(CONCAT(id::text, '-', ${randomSeed}))
      LIMIT ${limit} OFFSET ${offset}
    `
  );

  // Fetch full poll data with votes
  const polls = await prisma.poll.findMany({
    where: {
      id: { in: pollIds.map((p) => p.id) },
    },
    include: {
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  // Maintain random order
  const pollMap = new Map(polls.map((poll) => [poll.id, poll]));
  const orderedPolls = pollIds.map(({ id }) => pollMap.get(id)!);

  return {
    data: orderedPolls.map((poll) => serializePoll(poll, now)),
    randomSeed,
  };
}

/**
 * Handles standard time-based ordering
 */
async function handleTimeOrderedQuery({
  filters,
  page,
  limit,
  orderDir,
  now,
}: {
  filters: any;
  page: number;
  limit: number;
  orderDir?: OrderDir;
  now: Date;
}): Promise<Poll[]> {
  const orderBy = { start_time: getOrderDirection(orderDir) };

  return await prisma.poll
    .findMany({
      where: filters,
      take: limit,
      skip: (page - 1) * limit,
      orderBy,
      include: {
        votes: {
          select: {
            choice: true,
          },
        },
      },
    })
    .then((polls) => polls.map((poll) => serializePoll(poll, now)));
}

/**
 * Processes poll data based on management override and vote visibility settings
 */
function processDataForVisibility(
  data: Poll[],
  managementOverride: boolean
): Poll[] {
  if (managementOverride) return data;

  return data.map((poll) => ({
    ...poll,
    votes: poll.show_voting ? poll.votes ?? [] : null,
    // total_votes is already included and remains visible
  }));
}

/**
 * Retrieves a single poll by ID
 */
export async function getPollById(
  id: number,
  managementOverride: boolean = false
): Promise<Poll | null> {
  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  if (!poll) return null;

  if (!managementOverride) {
    return { ...serializePoll(poll), votes: null };
  }

  return serializePoll(poll);
}

/**
 * Retrieves multiple polls by their IDs
 */
export async function getPollsFromList(
  pollIds: number[],
  managementOverride: boolean = false
): Promise<Poll[]> {
  const polls = await prisma.poll.findMany({
    where: {
      id: { in: pollIds },
    },
    include: {
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  return polls.map((poll) => {
    if (managementOverride) {
      return serializePoll(poll);
    }
    return { ...serializePoll(poll), votes: null };
  });
}

// ===== WRITE SERVICES =====

/**
 * Whitelisted bulk-update fields for updatePollsByTag: the update
 * route's accepted body minus num/message_id/crosspost_message_ids
 * (publish-side state) and tag (inherently unchanged when updating by
 * tag).
 */
export interface PollTagUpdateFields {
  question?: string;
  description?: string | null;
  image?: string | null;
  thread_question?: string | null;
  show_question?: boolean;
  show_options?: boolean;
  show_voting?: boolean;
  time?: PollTimeInput;
  start_time?: PollTimeInput;
  end_time?: PollTimeInput;
}

/**
 * Normalized write input: JSON bodies carry guild ids as strings, so
 * they are converted to bigint before validation (extracted from the
 * old routes).
 */
type NormalizedPollInput = PollWriteInput & { guild_id?: bigint };

function normalizePollGuildId(poll: PollWriteInput): NormalizedPollInput {
  return {
    ...poll,
    guild_id:
      typeof poll.guild_id === "string" ? BigInt(poll.guild_id) : poll.guild_id,
  };
}

/**
 * Creates polls: bulk validation (shape, required tag, guild scope, tag
 * existence), unique random 5-digit ids, `published: false` like the
 * bot, and `end_time` alongside the `time`/`start_time` alias rule.
 * Returns the created models with their (empty) vote relation; routes
 * serialize.
 */
export async function createPolls(
  pollsData: PollWriteInput[],
): Promise<PollWithVotes[]> {
  if (!Array.isArray(pollsData) || pollsData.length === 0) {
    throw new BadRequestError("pollsData must be a non-empty array");
  }

  // Convert string guild_id to bigint before validation
  const normalizedPollsData = pollsData.map(normalizePollGuildId);

  const tags = await getTags();

  normalizedPollsData.forEach((poll) => {
    validatePoll(poll);

    if (poll.tag === undefined) {
      throw new BadRequestError("Poll tag is required");
    }

    if (poll.guild_id !== config.guildId) {
      throw new ApiError("Cannot create polls for other guilds", 403);
    }

    if (!tags.some((tag) => tag.tag === poll.tag)) {
      throw new NotFoundError(`Tag with id ${poll.tag} not found`);
    }

    resolveStartTime(poll);
  });

  // Generate unique poll IDs and create polls
  const createdPolls = await Promise.all(
    normalizedPollsData.map(async (poll) => {
      // Generate unique poll ID (matching bot logic)
      let pollId: number;
      while (true) {
        pollId = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
        const existing = await prisma.poll.findUnique({
          where: { id: pollId },
        });
        if (!existing) break;
      }

      const startInput = resolveStartTime(poll);
      return await prisma.poll.create({
        data: {
          id: pollId,
          question: poll.question!,
          published: false, // Always false initially like bot
          guild_id: poll.guild_id!,
          choices: poll.choices!,
          start_time: startInput ? new Date(startInput) : null,
          end_time: poll.end_time ? new Date(poll.end_time) : null,
          num: null, // Set later when published
          message_id: null, // Set later when published
          crosspost_message_ids: [], // Empty initially
          tag: poll.tag!,
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
          votes: {
            select: {
              choice: true,
            },
          },
        },
      });
    }),
  );

  console.log(
    `Created ${createdPolls.length} polls: ${createdPolls
      .map((p) => `"${p.question}"`)
      .join(", ")}`,
  );
  return createdPolls;
}

/**
 * Updates polls by id: bulk shape/guild validation, existence check, the
 * post-publish field matrix, then the update mapping (partial-preserve
 * for num/message_id/crossposts; start_time resolved via the `time`
 * alias; end_time freely editable in any state). Returns the updated
 * models with their vote relation; routes serialize.
 */
export async function updatePolls(
  pollsData: PollWriteInput[],
): Promise<PollWithVotes[]> {
  if (!Array.isArray(pollsData) || pollsData.length === 0) {
    throw new BadRequestError("pollsData must be a non-empty array");
  }

  // Convert string guild_id to bigint before validation
  const normalizedPollsData = pollsData.map(normalizePollGuildId);

  normalizedPollsData.forEach((poll) => {
    validatePoll(poll);

    resolveStartTime(poll);

    if (poll.guild_id !== config.guildId) {
      throw new ApiError("Cannot update polls for other guilds", 403);
    }
  });

  const existingPolls = await getPollsFromList(
    normalizedPollsData.map((poll) => poll.id!),
    true,
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

      const resolvedStart = resolveStartTime(poll);
      return await prisma.poll.update({
        where: { id: poll.id! },
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
          ...(resolvedStart !== undefined && {
            start_time: coerceDate(resolvedStart),
          }),
          ...(poll.end_time !== undefined && {
            end_time: coerceDate(poll.end_time),
          }),
          ...(poll.num !== undefined && { num: poll.num }),
          ...(poll.message_id && { message_id: BigInt(poll.message_id) }),
          ...(poll.crosspost_message_ids && {
            crosspost_message_ids: poll.crosspost_message_ids.map((id) =>
              BigInt(id),
            ),
          }),
          // Preserve published state from existing poll
          published: existingPoll.published,
        },
        include: {
          tagRelation: true,
          votes: {
            select: {
              choice: true,
            },
          },
        },
      });
    }),
  );
  console.log(
    `Updated ${updatedPolls.length} polls: ${updatedPolls
      .map((p) => `"${p.question}"`)
      .join(", ")}`,
  );
  return updatedPolls;
}

/**
 * Deletes unpublished polls of this guild by id. Votes cascade via the
 * poll FK, so a single poll.deleteMany replaces the old explicit
 * vote-then-poll transaction. Returns the deleteMany result ({ count }).
 */
export async function deletePolls(
  pollIds: Array<string | number>,
): Promise<{ count: number }> {
  if (!Array.isArray(pollIds) || pollIds.length === 0) {
    throw new BadRequestError("pollIds must be a non-empty array");
  }
  const ids = pollIds.map(Number);

  // fetches the polls to ensure they exist and the user has permission to delete them
  const polls = await getPollsFromList(ids, true);
  if (polls.length !== ids.length) {
    throw new NotFoundError("One or more polls not found");
  }

  if (polls.some((poll) => poll.published)) {
    throw new ApiError("Cannot delete published polls", 403);
  }

  if (polls.some((poll) => poll.guild_id !== config.guildId)) {
    throw new ApiError("Cannot delete polls from other guilds", 403);
  }

  // Delete polls; related votes cascade via FK
  const deletedPolls = await prisma.poll.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  if (deletedPolls.count === 0) {
    throw new NotFoundError("No polls found with the provided IDs");
  }

  console.log(`Deleted ${deletedPolls.count} polls with IDs: ${ids.join(", ")}`);
  return deletedPolls;
}

/**
 * Bulk-updates every poll of a tag with the same whitelisted fields.
 * The field matrix applies per poll (start_time frozen once published;
 * the tag itself never changes here), and every poll is validated
 * BEFORE any write, so one rejection fails the whole batch. Returns the
 * updated models with their vote relation; routes serialize.
 */
export async function updatePollsByTag(
  tag: number,
  fields: PollTagUpdateFields,
): Promise<PollWithVotes[]> {
  const resolvedStart = resolveStartTime(fields);

  const polls = await prisma.poll.findMany({
    where: { guild_id: config.guildId, tag },
    include: {
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  // All-or-nothing: validate every poll before writing any
  polls.forEach((poll) => {
    validatePublishedPoll(fields, poll);
  });

  const updatedPolls = await Promise.all(
    polls.map((poll) =>
      prisma.poll.update({
        where: { id: poll.id },
        data: {
          ...(fields.question !== undefined && { question: fields.question }),
          ...(fields.description !== undefined && {
            description: fields.description,
          }),
          ...(fields.image !== undefined && { image: fields.image }),
          ...(fields.thread_question !== undefined && {
            thread_question: fields.thread_question,
          }),
          ...(fields.show_question !== undefined && {
            show_question: fields.show_question,
          }),
          ...(fields.show_options !== undefined && {
            show_options: fields.show_options,
          }),
          ...(fields.show_voting !== undefined && {
            show_voting: fields.show_voting,
          }),
          ...(resolvedStart !== undefined && {
            start_time: coerceDate(resolvedStart),
          }),
          ...(fields.end_time !== undefined && {
            end_time: coerceDate(fields.end_time),
          }),
        },
        include: {
          tagRelation: true,
          votes: {
            select: {
              choice: true,
            },
          },
        },
      }),
    ),
  );

  console.log(
    `Updated ${updatedPolls.length} polls by tag ${tag}: ${updatedPolls
      .map((p) => `"${p.question}"`)
      .join(", ")}`,
  );
  return updatedPolls;
}
