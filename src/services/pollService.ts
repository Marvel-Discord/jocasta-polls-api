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
	console.log(search);
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
									search: search,
								},
							},
							{
								description: {
									search: search,
								},
							},
							{
								thread_question: {
									search: search,
								},
							},
							{
								choices: {
									has: search,
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
