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

authRouter.post("/logout", (req, res) => {
	req.logout((err) => {
		if (err) {
			return res.status(500).json({ message: "Logout failed" });
		}
		res.status(200).json({ message: "Logged out successfully" });
	});
});

authRouter.get("/me", (req, res) => {
	if (req.isAuthenticated()) {
		const discordProfile = req.user as DiscordUserProfile;
		res.json(discordProfile);
	} else {
		res.status(401).json({ message: "Unauthorized" });
	}
});
