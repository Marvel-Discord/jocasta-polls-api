import { prisma } from "@/client";
import type { Meta, Poll } from "@/types";
import { type polls, Prisma } from "@prisma/client";

interface PollFilters {
	guildId: bigint;
	published?: boolean;
	tag?: number;
	user?: PollFilterUser;
	search?: string;

	page?: number;
	limit?: number;
}

export interface PollFilterUser {
	userId: bigint;
	notVoted?: boolean;
}

export async function getPolls({
	guildId,
	published = true,
	tag,
	user,
	search,
	page = 1,
	limit = 10,
}: PollFilters): Promise<{ data: Poll[]; meta: Meta }> {
	const safeSearch = search ? safeTsQuery(search) : undefined;

	const filters = {
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

		...(search
			? {
					OR: [
						{
							question: {
								contains: safeSearch,
								mode: Prisma.QueryMode.insensitive,
							},
						},
						{
							description: {
								contains: safeSearch,
								mode: Prisma.QueryMode.insensitive,
							},
						},
						{ choices: { has: safeSearch } },
					],
				}
			: {}),
	};

	const [data, total] = await Promise.all([
		prisma.polls
			.findMany({
				where: filters,
				take: limit,
				skip: (page - 1) * limit,
				orderBy: {
					time: "desc",
				},
				include: {
					votesRelation: {
						select: {
							choice: true,
						},
					},
				},
			})
			.then((polls) => polls.map((poll) => tallyVotes(poll))),

		prisma.polls.count({
			where: filters,
		}),
	]);

	const meta: Meta = {
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
		nextPage: page < Math.ceil(total / limit) ? page + 1 : null,
		prevPage: page > 1 ? page - 1 : null,
	};

	return { data, meta };
}

export async function getPollById(id: number): Promise<Poll | null> {
	const poll = await prisma.polls.findUnique({
		where: {
			id,
		},
		include: {
			votesRelation: {
				select: {
					choice: true,
				},
			},
		},
	});

	if (!poll) return null;

	return tallyVotes(poll);
}

function tallyVotes(
	poll: polls & { votesRelation: { choice: number }[] },
): Poll {
	const { votesRelation, ...restPoll } = poll;
	const voteTally = new Array(poll.choices.length).fill(0);
	for (const vote of poll.votesRelation) {
		voteTally[vote.choice] = (voteTally[vote.choice] || 0) + 1;
	}

	return {
		...restPoll,
		votes: voteTally,
	};
}

function safeTsQuery(input: string): string {
	// Escape the special characters so they can be used safely
	const escapedInput = input
		.toLowerCase()
		.replace(/([&|!()"'`])/g, "\\$1") // Escape special characters
		.replace(/\s+/g, " ") // Normalize whitespace (e.g., multiple spaces)
		.trim()
		.split(" ")
		.filter(Boolean) // Remove empty strings
		.join(" "); // Join with 'AND' logic

	return escapedInput;
}
