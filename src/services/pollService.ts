import { prisma } from "@/client";
import type { Meta } from "@/types/meta";
import type { Poll } from "@/types/poll";

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
						{ question: { search: safeSearch } },
						{ description: { search: safeSearch } },
						{ choices: { has: safeSearch } },
					],
				}
			: {}),
	};

	const [data, total] = await Promise.all([
		prisma.polls.findMany({
			where: filters,
			take: limit,
			skip: (page - 1) * limit,
			orderBy: {
				time: "desc",
			},
		}),
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
	});

	if (!poll) return null;

	return poll;
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
		.join(" & "); // Join with 'AND' logic

	return escapedInput;
}
