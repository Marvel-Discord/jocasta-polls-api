import dotenv from "dotenv";

dotenv.config();

function requiredEnv(key: keyof NodeJS.ProcessEnv): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable is missing: ${key}`);
  }

  return value;
}

const config = {
  /**
   * In development mode, secure cookies are not used for sending the profile. This is because
   * they can't be accessed over HTTP on Safari.
   */
  environment: process.env.NODE_ENV || "production",
  api: {
    port: Number(process.env.PORT || 8000),
  },
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  guildId: BigInt(process.env.GUILD_ID ?? 0),
  // having a random secret would mess with persistent sessions
  expressSessionSecret:
    process.env.EXPRESS_SESSION_SECRET || "change the secret in production",
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    enabled: process.env.REDIS_ENABLED === "true" || process.env.NODE_ENV === "production",
  },
  auth: {
    discord: {
      clientId: requiredEnv("DISCORD_CLIENT_ID"),
      clientSecret: requiredEnv("DISCORD_CLIENT_SECRET"),
      redirectUri: requiredEnv("DISCORD_REDIRECT_URI"),
      botToken: requiredEnv("DISCORD_BOT_TOKEN"),
    },
  },
} as const;

export default config;
