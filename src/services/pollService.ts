import { prisma } from "@/client";
import type { Poll } from "@/types/poll";

export async function getPolls(): Promise<Poll[]> {
	const polls = await prisma.polls.findMany({
		where: {
			published: true,
		},
		take: 10,
	});

	return polls.map((poll: Poll) => {
		return {
			...poll,
			guild_id: BigInt(poll.guild_id),
			message_id: poll.message_id !== null ? BigInt(poll.message_id) : null,
			crosspost_message_ids: poll.crosspost_message_ids.map((id: bigint) =>
				BigInt(id),
			),
		};
	});
}
