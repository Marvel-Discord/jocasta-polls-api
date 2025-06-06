import { getGuildById } from "@/services/guildService";
import type { DiscordUserProfile } from "@/types/discordUserProfile";

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
