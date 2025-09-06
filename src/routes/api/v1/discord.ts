import { Router } from "express";
import { fetchGuildChannels } from "@/services/discordService";
import { parseGuildId } from "@/models/paramModels";
import { ApiError } from "@/errors";

export const discordRouter = Router();

discordRouter.get("/guilds/:guildId/channels", async (req, res, next) => {
  try {
    const guildId = await parseGuildId(req.params);

    // Only allow access to our specific guild
    if (guildId !== BigInt("281648235557421056")) {
      throw new ApiError("Guild not supported", 403);
    }

    const channels = await fetchGuildChannels(guildId.toString());

    res.json(channels);
  } catch (error) {
    next(error);
  }
});
