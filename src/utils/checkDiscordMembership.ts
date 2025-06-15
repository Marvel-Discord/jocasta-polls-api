import config from "@/config";
import { getGuildById } from "@/services/guildService";
import type { DiscordUserProfile } from "@/types/discordUserProfile";

import { Request } from "express";

const roleCache = new Map<
  string,
  { roles: string[]; expiresAt: number; memberData: any }
>();

function getCachedMember(
  userId: string
): { roles: string[]; memberData: any } | null {
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  return null;
}

function setCachedMember(
  userId: string,
  roles: string[],
  memberData: any,
  ttlMs: number = 120000
) {
  roleCache.set(userId, {
    roles,
    memberData,
    expiresAt: Date.now() + ttlMs,
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, { expiresAt }] of roleCache.entries()) {
    if (expiresAt < now) {
      roleCache.delete(key);
    }
  }
}, 10000);

export async function checkUserHasManagementPerms(
  user: DiscordUserProfile,
  guildId: bigint
): Promise<boolean> {
  const guildInfo = await getGuildById(guildId);
  if (!guildInfo) return false;

  const cached = getCachedMember(user.id);
  if (cached) {
    return guildInfo.manager_role_id.some((roleId: bigint) =>
      cached.roles.includes(roleId.toString())
    );
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.log(response.status, response.statusText);
      return false;
    }

    const member = await response.json();
    const userRoles: string[] = member.roles;

    setCachedMember(user.id, userRoles, member);

    return guildInfo.manager_role_id.some((roleId: bigint) =>
      userRoles.includes(roleId.toString())
    );
  } catch (err) {
    console.error("Error checking management permissions:", err);
    return false;
  }
}

export async function checkUserInServer(
  user: DiscordUserProfile,
  guildId: bigint
): Promise<boolean> {
  if (!user.accessToken) return false;

  const cached = getCachedMember(user.id);
  if (cached) {
    return true;
  }

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

    setCachedMember(user.id, userRoles, member);

    return true;
  } catch (err) {
    console.error("Error checking if user is in server:", err);
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
