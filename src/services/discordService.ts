import config from "@/config";
import { ApiError } from "@/errors";

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  permission_overwrites: Array<{
    id: string;
    type: number;
    allow: string;
    deny: string;
  }>;
}

interface DiscordGuildMember {
  user: {
    id: string;
  };
  roles: string[];
}

interface DiscordRole {
  id: string;
  permissions: string;
}

interface FormattedChannel {
  id: string;
  name: string;
  position: number;
}

// Cache for Discord channels
const channelCache = new Map<
  string,
  { channels: FormattedChannel[]; expiresAt: number }
>();

export function getCachedChannels(guildId: string): FormattedChannel[] | null {
  const cached = channelCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.channels;
  }
  return null;
}

export function setCachedChannels(
  guildId: string,
  channels: FormattedChannel[],
  ttlMs: number = 300000
) {
  // 5 minutes
  channelCache.set(guildId, {
    channels,
    expiresAt: Date.now() + ttlMs,
  });
}

function canBotSendMessages(
  channel: DiscordChannel,
  guildId: string,
  botId: string,
  botRoles: string[],
  guildRoles: DiscordRole[]
): boolean {
  const SEND_MESSAGES = BigInt(0x800);
  const ADMINISTRATOR = BigInt(0x8);

  // Base permissions from roles
  let perms = BigInt(0);

  const everyoneRole = guildRoles.find((r) => r.id === guildId);
  if (everyoneRole) perms |= BigInt(everyoneRole.permissions);

  for (const roleId of botRoles) {
    const role = guildRoles.find((r) => r.id === roleId);
    if (role) perms |= BigInt(role.permissions);
  }

  // Admin bypass
  if (perms & ADMINISTRATOR) return true;

  // Helper: apply channel overwrite
  const applyOverwrite = (
    overwrite: { allow: string; deny: string } | undefined
  ) => {
    if (!overwrite) return;
    const denyBits = BigInt(overwrite.deny);
    const allowBits = BigInt(overwrite.allow);
    perms &= ~denyBits;
    perms |= allowBits;
  };

  // Apply overwrites in order: everyone, roles, member
  applyOverwrite(
    channel.permission_overwrites.find((o) => o.id === guildId && o.type === 0)
  );

  for (const roleId of botRoles) {
    applyOverwrite(
      channel.permission_overwrites.find((o) => o.id === roleId && o.type === 0)
    );
  }

  applyOverwrite(
    channel.permission_overwrites.find((o) => o.id === botId && o.type === 1)
  );

  // Final check
  return Boolean(perms & SEND_MESSAGES);
}

function isChannelPublic(channel: DiscordChannel, guildId: string): boolean {
  // Check if @everyone role has VIEW_CHANNEL permission
  // VIEW_CHANNEL permission bit: 1024 (0x400)
  const everyoneOverwrite = channel.permission_overwrites.find(
    (overwrite) => overwrite.id === guildId && overwrite.type === 0
  );

  if (everyoneOverwrite) {
    const denyPerms = BigInt(everyoneOverwrite.deny);
    const allowPerms = BigInt(everyoneOverwrite.allow);
    const viewChannelPerm = BigInt(1024);

    // If VIEW_CHANNEL is explicitly denied, channel is private
    if (denyPerms & viewChannelPerm) return false;
    // If VIEW_CHANNEL is explicitly allowed, channel is public
    if (allowPerms & viewChannelPerm) return true;
  }

  // Default behavior - channels are public unless explicitly denied
  return true;
}

function filterPublicTextChannels(
  channels: DiscordChannel[],
  guildId: string,
  botId: string,
  botRoles: string[],
  guildRoles: DiscordRole[]
): FormattedChannel[] {
  return channels
    .filter(
      (channel) =>
        channel.type === 0 && // Text channels only
        isChannelPublic(channel, guildId) &&
        canBotSendMessages(channel, guildId, botId, botRoles, guildRoles)
    )
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      position: channel.position,
    }))
    .sort((a, b) => a.position - b.position);
}

export async function fetchGuildChannels(
  guildId: string
): Promise<FormattedChannel[]> {
  // Check cache first
  const cached = getCachedChannels(guildId);
  if (cached) {
    return cached;
  }

  try {
    // Fetch channels
    const channelsResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${config.auth.discord.botToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!channelsResponse.ok) {
      if (channelsResponse.status === 403) {
        throw new ApiError("Bot missing permissions or not in server", 403);
      }
      if (channelsResponse.status === 404) {
        throw new ApiError("Guild not found", 404);
      }
      if (channelsResponse.status === 429) {
        throw new ApiError("Rate limited by Discord API", 429);
      }
      throw new ApiError(`Discord API error: ${channelsResponse.status}`, 500);
    }

    // Fetch bot's guild member information
    const botResponse = await fetch(`https://discord.com/api/v10/users/@me`, {
      method: "GET",
      headers: {
        Authorization: `Bot ${config.auth.discord.botToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!botResponse.ok) {
      throw new ApiError("Failed to fetch bot information", 500);
    }

    const botUser = await botResponse.json();
    const botId = botUser.id;

    // Fetch bot's member information in the guild
    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${botId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${config.auth.discord.botToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!memberResponse.ok) {
      throw new ApiError("Bot not found in guild", 403);
    }

    // Fetch guild roles to check role-based permissions
    const rolesResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${config.auth.discord.botToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!rolesResponse.ok) {
      throw new ApiError("Failed to fetch guild roles", 500);
    }

    const botMember: DiscordGuildMember = await memberResponse.json();
    const guildRoles: DiscordRole[] = await rolesResponse.json();
    const channels: DiscordChannel[] = await channelsResponse.json();
    const filteredChannels = filterPublicTextChannels(
      channels,
      guildId,
      botId,
      botMember.roles,
      guildRoles
    );

    // Cache the results
    setCachedChannels(guildId, filteredChannels);

    return filteredChannels;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("Failed to fetch Discord channels", 500);
  }
}
