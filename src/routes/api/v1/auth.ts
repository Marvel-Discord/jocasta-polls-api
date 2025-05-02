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
		res.redirect(`${config.frontendUrl}/polls`);
	},
);

authRouter.get("/me", (req, res) => {
	if (req.isAuthenticated()) {
		const discordProfile = req.user as DiscordUserProfile;
		res.json(discordProfile);
	} else {
		res.status(401).json({ message: "Unauthorized" });
	}
});
