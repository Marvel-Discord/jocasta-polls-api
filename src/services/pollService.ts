import { Prisma, type Poll as PollModel } from "@/generated/prisma/client";

import { prisma } from "@/client";
import type { Meta, Poll } from "@/types";
import { OrderDir, OrderType } from "@/types";

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
  state?: "start" | "end";
  active_or_persistent?: boolean;
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
type PollWithVotes = PollModel & {
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
 * Serializes a poll with its vote relation into the API contract shape:
 * tallies votes per choice, emits start_time/end_time, and keeps time as
 * the compatibility alias for start_time (website; removable post-migration)
 */
export function serializePoll(poll: PollWithVotes): Poll {
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
 * Builds a Prisma where-input fragment for the bot-facing aux list filters
 * (ids, num, state, active_or_persistent). Pure — no DB access — so it can
 * be unit tested directly and composed into the list path's filters object.
 *
 * `state` couples a time check with `published`/`active`, so this fragment
 * must be merged AFTER (and never overridden by) the base builder's keys.
 */
export function buildPollAuxFilters(params: {
  ids?: number[];
  num?: number;
  state?: "start" | "end";
  active_or_persistent?: boolean;
}): Prisma.PollWhereInput {
  const aux: Prisma.PollWhereInput = {};
  if (params.ids?.length) aux.id = { in: params.ids };
  if (params.num !== undefined) aux.num = params.num;
  if (params.state === "start") {
    // scheduled, not yet started
    aux.start_time = { not: null };
    aux.published = false;
  } else if (params.state === "end") {
    // running with an end scheduled
    aux.end_time = { not: null };
    aux.active = true;
  }
  if (params.active_or_persistent === true) {
    aux.OR = [{ active: true }, { tagRelation: { persistent: true } }];
  }
  return aux;
}

/**
 * Merges the bot-facing aux filters into the base filters (aux-last so
 * `state`'s published/active coupling is never clobbered). When both sides
 * carry a top-level OR (`search` and `active_or_persistent`), each is lifted
 * into its own AND group so neither silently drops the other.
 */
export function mergeAuxFilters(
  base: Prisma.PollWhereInput,
  aux: Prisma.PollWhereInput,
): Prisma.PollWhereInput {
  const merged = { ...base };
  if (aux.OR && merged.OR) {
    const baseOr = merged.OR;
    delete merged.OR;
    merged.AND = [
      ...((merged.AND as Prisma.PollWhereInput[]) ?? []),
      { OR: baseOr },
      { OR: aux.OR },
    ];
    const { OR: _auxOr, ...restAux } = aux;
    Object.assign(merged, restAux);
  } else {
    Object.assign(merged, aux);
  }
  return merged;
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
  state,
  active_or_persistent,
  user,
  search,
  page = 1,
  limit = 10,
  managementOverride = false,
  order = OrderType.Time,
  orderDir,
  seed,
}: PollFilters): Promise<{ data: Poll[]; meta: Meta }> {
  const searchQuery = search ? sanitizeSearchInput(search) : undefined;
  // aux filters are merged last: `state` sets published/active and must not
  // be clobbered by the base builder's keys
  const filters = mergeAuxFilters(
    buildPollFilters({
      published,
      guildId,
      tag,
      user,
      searchQuery,
    }),
    buildPollAuxFilters({ ids, num, state, active_or_persistent }),
  );

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
      seed,
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
  seed,
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
  seed?: number;
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
    return await handleVoteOrderedQuery({ filters, limit, offset, orderDir });
  } else {
    return await handleRandomOrderedQuery({
      guildId,
      published,
      tag,
      searchQuery,
      filters,
      limit,
      offset,
      seed,
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
}: {
  filters: any;
  limit: number;
  offset: number;
  orderDir?: OrderDir;
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

  return { data: polls.map(serializePoll) };
}

/**
 * Handles random ordering using database-level randomization
 */
async function handleRandomOrderedQuery({
  guildId,
  published,
  tag,
  searchQuery,
  filters,
  limit,
  offset,
  seed,
}: {
  guildId: bigint;
  published?: boolean;
  tag?: number;
  searchQuery?: string;
  filters: any;
  limit: number;
  offset: number;
  seed?: number;
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
    data: orderedPolls.map(serializePoll),
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
}: {
  filters: any;
  page: number;
  limit: number;
  orderDir?: OrderDir;
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
    .then((polls) => polls.map(serializePoll));
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
