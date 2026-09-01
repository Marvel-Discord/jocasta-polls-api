import { vi } from "vitest";

// The server entry (src/index.ts) installs BigInt.prototype.toJSON so
// express's res.json can serialize prisma bigint columns; tests build the
// app via createApp() instead, so mirror the production patch here.
import "@/utils";

process.env.NODE_ENV = "test";
process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ||= "test-client-secret";
process.env.DISCORD_REDIRECT_URI ||= "http://localhost:3000/callback";
process.env.DISCORD_BOT_TOKEN ||= "test-bot-token";
process.env.EXPRESS_SESSION_SECRET ||= "test-session-secret";
process.env.GUILD_ID ||= "0";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
process.env.BOT_SERVICE_TOKEN ||= "test-bot-service-token";

// vi.mock factories are hoisted above this file's imports, so the factory
// cannot reference an imported `createFixturePrisma` binding directly.
// Instead the (lazily-evaluated, async) factory dynamic-imports the
// fixtures module — vitest resolves the relative path against this file —
// keeping the fixtures in their own module for direct import by tests.
vi.mock("@/client", async () => {
  const { createFixturePrisma } = await import("./fixtures");
  return {
    prisma: createFixturePrisma(),
  };
});
