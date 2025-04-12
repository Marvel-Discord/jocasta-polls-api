import { prisma } from "@/client";
import type { Poll } from "@/types/poll";

interface PollFilters {
	guildId: bigint;
	published?: boolean;
	tag?: number;
}

export async function getPolls({
	guildId,
	published = true,
	tag,
}: PollFilters): Promise<Poll[]> {
	const polls = await prisma.polls.findMany({
		where: {
			published: published,
			guild_id: guildId,
			...(tag !== undefined ? { tag: tag } : {}),
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
