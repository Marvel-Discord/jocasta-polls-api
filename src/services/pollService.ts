import { Prisma, type polls } from "@prisma/client";

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
type PollWithVotes = polls & { votesRelation: { choice: number }[] };

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
 * Tallies votes for a poll and returns the poll with vote counts
 */
function tallyPollVotes(poll: PollWithVotes): Poll {
  const { votesRelation, ...restPoll } = poll;
  const voteTally = new Array(poll.choices.length).fill(0);

  for (const vote of votesRelation) {
    if (vote.choice >= 0 && vote.choice < voteTally.length) {
      voteTally[vote.choice]++;
    }
  }

  const totalVotes = voteTally.reduce((sum, count) => sum + count, 0);

  return {
    ...restPoll,
    votes: voteTally,
    totalVotes,
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
          votesRelation: user.notVoted
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
 * Gets poll IDs that a user has voted on, with optional filtering
 */
async function getUserVotedPollIds(user?: PollFilterUser) {
  if (!user) return null;

  const votedPolls = await prisma.pollsvotes.findMany({
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
  published = true,
  tag,
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
  const filters = buildPollFilters({
    published,
    guildId,
    tag,
    user,
    searchQuery,
  });

  // Get total count for pagination
  const total = await prisma.polls.count({ where: filters });

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
 * Handles vote count ordering using polls_view for efficient database-level sorting
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
  // Use polls_view for efficient vote count sorting at database level
  const pollsFromView = await prisma.polls_view.findMany({
    where: filters,
    take: limit,
    skip: offset,
    orderBy: {
      vote_count: getOrderDirection(orderDir),
    },
  });

  // Get the poll IDs to fetch full poll data with vote details
  const pollIds = pollsFromView.map((p) => p.id);

  const polls = await prisma.polls.findMany({
    where: {
      id: { in: pollIds },
    },
    include: {
      votesRelation: {
        select: {
          choice: true,
        },
      },
    },
  });

  // Create a map for efficient lookup and maintain sort order from polls_view
  const pollMap = new Map(polls.map((poll) => [poll.id, poll]));
  const orderedPolls = pollIds.map((id) => pollMap.get(id)!);

  return { data: orderedPolls.map(tallyPollVotes) };
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
  const polls = await prisma.polls.findMany({
    where: {
      id: { in: pollIds.map((p) => p.id) },
    },
    include: {
      votesRelation: {
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
    data: orderedPolls.map(tallyPollVotes),
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
  const orderBy = { time: getOrderDirection(orderDir) };

  return await prisma.polls
    .findMany({
      where: filters,
      take: limit,
      skip: (page - 1) * limit,
      orderBy,
      include: {
        votesRelation: {
          select: {
            choice: true,
          },
        },
      },
    })
    .then((polls) => polls.map(tallyPollVotes));
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
    // totalVotes is already included and remains visible
  }));
}

/**
 * Retrieves a single poll by ID
 */
export async function getPollById(
  id: number,
  managementOverride: boolean = false
): Promise<Poll | null> {
  const poll = await prisma.polls.findUnique({
    where: { id },
    include: {
      votesRelation: {
        select: {
          choice: true,
        },
      },
    },
  });

  if (!poll) return null;

  if (!managementOverride) {
    const { votesRelation, ...restPoll } = poll;
    const totalVotes = votesRelation.length;
    return { ...restPoll, votes: null, totalVotes };
  }

  return tallyPollVotes(poll);
}

/**
 * Retrieves multiple polls by their IDs
 */
export async function getPollsFromList(
  pollIds: number[],
  managementOverride: boolean = false
): Promise<Poll[]> {
  const polls = await prisma.polls.findMany({
    where: {
      id: { in: pollIds },
    },
    include: {
      votesRelation: {
        select: {
          choice: true,
        },
      },
    },
  });

  return polls.map((poll) => {
    if (managementOverride) {
      return tallyPollVotes(poll);
    }
    const { votesRelation, ...restPoll } = poll;
    const totalVotes = votesRelation.length;
    return { ...restPoll, votes: null, totalVotes };
  });
}
