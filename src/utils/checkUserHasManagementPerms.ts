import config from "@/config";
import { getGuildById } from "@/services/guildService";
import type { DiscordUserProfile } from "@/types/discordUserProfile";

import { Request } from "express";

export async function checkUserHasManagementPerms(
  user: DiscordUserProfile,
  guildId: bigint
): Promise<boolean> {
  const guildInfo = await getGuildById(guildId);
  if (!guildInfo) return false;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      }
    );

    console.log(response);

    if (!response.ok) return false;

    const member = await response.json();
    const userRoles: string[] = member.roles;

    return guildInfo.manager_role_id.some((roleId: bigint) =>
      userRoles.includes(roleId.toString())
    );
  } catch (err) {
    console.error("Error checking management permissions:", err);
    return false;
  }
}

async function attachManagementPermsFlagForGuild(
  req: Request,
  guildId: bigint
): Promise<boolean> {
  if (!req.isAuthenticated?.() || !req.user) return false;

  return await checkUserHasManagementPerms(
    req.user as DiscordUserProfile,
    guildId
  );
}

export async function attachManagementPermsFlag(
  req: Request
): Promise<boolean> {
  return attachManagementPermsFlagForGuild(req, config.guildId);
}
