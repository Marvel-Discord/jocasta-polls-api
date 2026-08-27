import { vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ||= "test-client-secret";
process.env.DISCORD_REDIRECT_URI ||= "http://localhost:3000/callback";
process.env.DISCORD_BOT_TOKEN ||= "test-bot-token";
process.env.EXPRESS_SESSION_SECRET ||= "test-session-secret";
process.env.GUILD_ID ||= "0";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
process.env.BOT_SERVICE_TOKEN ||= "test-bot-service-token";

vi.mock("@/client", () => ({
  prisma: {
    $connect: async () => {},
    $disconnect: async () => {},
  },
}));
