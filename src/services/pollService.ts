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

	return polls.map((poll: Poll) => formatPoll(poll));
}

export async function getPollById(id: number): Promise<Poll | null> {
	const poll = await prisma.polls.findUnique({
		where: {
			id,
		},
	});

	if (!poll) return null;

	return formatPoll(poll);
}

function formatPoll(poll: Poll): Poll {
	return {
		...poll,
		guild_id: BigInt(poll.guild_id),
		message_id: poll.message_id !== null ? BigInt(poll.message_id) : null,
		crosspost_message_ids: poll.crosspost_message_ids.map((id: bigint) =>
			BigInt(id),
		),
	};
}
