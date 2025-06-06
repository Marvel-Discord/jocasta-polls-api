export interface DiscordUserProfile extends Discord.PassportProfile {
  id: string;
  username: string;
  avatar?: string;
  global_name?: string;
  guilds?: {
    id: string;
    name: string;
  }[];
  accessToken?: string;
}

// The following is the full type of the DiscordUserProfile object returned by passport-discord
// {
//   id: 'string',
//   username: 'string',
//   avatar: 'string',
//   discriminator: 'string',
//   public_flags: 'number',
//   flags: 'number',
//   banner: 'string',
//   accent_color: 'number',
//   global_name: 'string',
//   avatar_decoration_data: 'object',
//   collectibles: 'object',
//   banner_color: 'string',
//   clan: 'object',
//   primary_guild: 'object',
//   mfa_enabled: 'boolean',
//   locale: 'string',
//   premium_type: 'number',
//   provider: 'string',
//   accessToken: 'string',
//   guilds: 'object',
//   fetchedAt: 'object'
// }
