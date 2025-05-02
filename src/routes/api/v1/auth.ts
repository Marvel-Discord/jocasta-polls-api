import config from "@/config";
import type { DiscordUserProfile } from "@/types";
import { Router } from "express";
import passport from "passport";

export const authRouter = Router();

authRouter.get("/", passport.authenticate("discord"));

authRouter.get(
	"/callback",
	passport.authenticate("discord", { failureRedirect: "/" }),
	async (req, res) => {
		const discordProfile = req.user as DiscordUserProfile;
		console.log(discordProfile);

		res.redirect(`${config.frontendUrl}/polls`);
	},
);
