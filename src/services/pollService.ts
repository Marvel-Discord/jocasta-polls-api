import { prisma } from "@/client";
import type { Poll } from "@/types/poll";

interface PollFilters {
	guildId: bigint;
	published?: boolean;
	tag?: number;
	user?: PollFilterUser;
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
}: PollFilters): Promise<Poll[]> {
	console.log(user);

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
