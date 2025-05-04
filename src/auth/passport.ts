import config from "@/config";
import passport from "passport";
import type { Express } from "express";
import { Strategy as DiscordStrategy } from "passport-discord";
import session from "express-session";
import type { DiscordUserProfile } from "@/types/discordUserProfile";

const discordStrategy = new DiscordStrategy(
	{
		clientID: config.auth.discord.clientId,
		clientSecret: config.auth.discord.clientSecret,
		callbackURL: config.auth.discord.redirectUri,
		scope: ["identify", "guilds"],
	},
	(accessToken, refreshToken, profile, done) => {
		// Here, you could save user to your DB if you want
		done(null, profile);
	},
);

export function initializeAuth(app: Express) {
	passport.serializeUser((user, done) => {
		done(null, user);
	});

	passport.deserializeUser<DiscordUserProfile>((user, done) => {
		done(null, user);
	});

	passport.use(discordStrategy);

	const isProduction = config.environment === "production";

	app.use(
		session({
			secret: config.expressSessionSecret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				httpOnly: true,
				sameSite: isProduction ? "none" : "lax",
				secure: isProduction,
			},
		}),
	);

	app.use(passport.initialize());
	app.use(passport.session());
}
