import { ApiError } from "@/errors";
import { parseTagId, type TagIdParams } from "@/models/paramModels";
import { getTagById, getTags } from "@/services/tagService";
import { attachManagementPermsFlag } from "@/utils/checkDiscordMembership";
import { Router } from "express";

export const tagRouter = Router();

tagRouter.get("/", async (req, res) => {
  try {
    const hasManagementPerms = await attachManagementPermsFlag(req);
    const tags = await getTags(!hasManagementPerms);
    res.status(200).json(tags);
  } catch (error) {
    ApiError.sendError(res, error);
  }
});

tagRouter.get("/:tagId", async (req, res) => {
  try {
    const tagId = await parseTagId(req.params as unknown as TagIdParams);
    const tag = await getTagById(tagId);
    if (!tag) {
      throw new ApiError(`Tag with id ${tagId} not found`, 404);
    }
    res.status(200).json(tag);
  } catch (error) {
    ApiError.sendError(res, error);
  }
});

tagRouter.post("/create", async (req, res) => {
  try {
    // TODO: Implement tag creation logic here
    console.log("Creating tags:", req.body);

    // Mock created tag - replace with actual creation logic
    const mockCreatedTag = {
      tag: Math.floor(Math.random() * 1000) + 1, // Random ID for now
      name: req.body.name || "New Tag",
      guild_id: BigInt(req.body.guild_id || "123456789012345678"),
      channel_id: BigInt(req.body.channel_id || "987654321098765432"),
      crosspost_channels: req.body.crosspost_channels || [],
      crosspost_servers: req.body.crosspost_servers || [],
      current_num: null,
      colour: req.body.colour || null,
      end_message: req.body.end_message || null,
      end_message_latest_ids: [],
      end_message_replace: req.body.end_message_replace || false,
      end_message_role_ids: req.body.end_message_role_ids || [],
      end_message_ping: req.body.end_message_ping || false,
      end_message_self_assign: req.body.end_message_self_assign || false,
      persistent: req.body.persistent || false,
    };

    res.status(201).json(mockCreatedTag);
  } catch (error) {
    ApiError.sendError(res, error);
  }
});
