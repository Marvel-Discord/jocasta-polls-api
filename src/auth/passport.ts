import config from "@/config";
import passport from "passport";
import type { Express } from "express";
import { Strategy as DiscordStrategy } from "passport-discord";
import session from "express-session";
import type { DiscordUserProfile } from "@/types/discordUserProfile";
import { createClient } from "redis";
import MemoryStore from "memorystore";
import type { Store } from "express-session";

// Import RedisStore with proper typing
let RedisStore: any;
try {
  RedisStore = require("connect-redis").default;
} catch {
  // RedisStore will be undefined if connect-redis is not available
}

const discordStrategy = new DiscordStrategy(
  {
    clientID: config.auth.discord.clientId,
    clientSecret: config.auth.discord.clientSecret,
    callbackURL: config.auth.discord.redirectUri,
    scope: ["identify", "guilds", "guilds.members.read"],
  },
  (accessToken, refreshToken, profile, done) => {
    const discordProfile = profile as DiscordUserProfile;
    discordProfile.accessToken = accessToken;
    done(null, discordProfile);
  }
);

async function createSessionStore(): Promise<Store> {
  if (config.redis.enabled && RedisStore) {
    try {
      const redisClient = createClient({
        url: config.redis.url,
      });

      redisClient.on("error", (err) => {
        console.warn("Redis Client Error:", err);
        console.warn("Falling back to file-based session store");
      });

      await redisClient.connect();
      console.log("Connected to Redis for session storage");

      // Initialize RedisStore with the connected client
      const redisStore = new RedisStore({
        client: redisClient,
        prefix: "jocasta-polls:",
      });

      return redisStore;
    } catch (error) {
      console.warn("Failed to connect to Redis:", error);
      console.warn("Falling back to file-based session store");
    }
  }

  // Fallback to memory-based session store (Windows-friendly)
  const MemoryStoreSession = MemoryStore(session);
  console.log("Using memory-based session storage with TTL");
  return new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    max: 1000, // max number of sessions
  });
}

export async function initializeAuth(app: Express) {
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser<DiscordUserProfile>((user, done) => {
    done(null, user);
  });

  passport.use(discordStrategy);

  const isProduction = config.environment === "production";
  const store = await createSessionStore();

  app.use(
    session({
      store,
      secret: config.expressSessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
}
