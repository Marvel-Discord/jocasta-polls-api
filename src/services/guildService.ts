import { prisma } from "@/client";
import type { PollInfo } from "@/types/pollinfo";

export async function getGuilds(): Promise<PollInfo[]> {
	const guilds = await prisma.pollsinfo.findMany();

	return guilds;
}
