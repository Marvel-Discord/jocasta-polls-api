import { DiscordUserProfile } from "@/types";

export async function checkUserInServer(
  user: DiscordUserProfile,
  guildId: bigint
): Promise<boolean> {
  if (!user.accessToken) return false;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      }
    );

    return response.ok; // user is in server if 200 OK
  } catch (err) {
    console.error("Error checking if user is in server:", err);
    return false;
  }
}
