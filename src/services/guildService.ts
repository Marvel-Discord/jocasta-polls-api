import { prisma } from "@/client";
import type { PollInfo } from "@/types";

export async function getGuilds(): Promise<PollInfo[]> {
  const guilds = await prisma.guildSettings.findMany();

  return guilds;
}

export async function getGuildById(id: bigint): Promise<PollInfo | null> {
  const guild = await prisma.guildSettings.findUnique({
    where: {
      guild_id: id,
    },
  });

  if (!guild) return null;

  return guild;
}
