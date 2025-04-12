import { prisma } from "@/client";
import type { Poll } from "@/types/poll";

interface PollFilters {
	guildId: bigint;
	published?: boolean;
	tag?: number;
	user?: PollFilterUser;
	search?: string;
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
}: PollFilters): Promise<Poll[]> {
	const safeSearch = search ? safeTsQuery(search) : undefined;

	const polls = await prisma.polls.findMany({
		where: {
			published: published,
			guild_id: guildId,

			...(tag !== undefined ? { tag: tag } : {}),

			...(user
				? {
						votesRelation: user.notVoted
							? {
									none: { user_id: user.userId },
								}
							: {
									some: { user_id: user.userId },
								},
					}
				: {}),

			...(search
				? {
						OR: [
							{
								question: {
									search: safeSearch,
								},
							},
							{
								description: {
									search: safeSearch,
								},
							},
							{
								choices: {
									has: safeSearch,
								},
							},
						],
					}
				: {}),
		},
		take: 10,
		orderBy: {
			time: "desc",
		},
	});

	return polls;
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
