import { ApiError, BadRequestError } from "@/errors";
import { prisma } from "@/client";
import { parseTagId, type TagIdParams } from "@/models/paramModels";
import { getTagById, getTags } from "@/services/tagService";
import { attachManagementPermsFlag } from "@/utils/checkDiscordMembership";
import { requireManagementPerms } from "@/middleware/requireAuth";
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

tagRouter.post("/create", requireManagementPerms, async (req, res) => {
  try {
    const tagData = req.body;

    // Validation
    if (!tagData.name || typeof tagData.name !== "string") {
      throw new BadRequestError("Tag name is required and must be a string");
    }
    if (!tagData.guild_id) {
      throw new BadRequestError("guild_id is required");
    }
    if (!tagData.channel_id) {
      throw new BadRequestError("channel_id is required");
    }

    // Check for duplicate names within the same guild
    const existingTag = await prisma.pollstags.findFirst({
      where: {
        guild_id: BigInt(tagData.guild_id),
        name: tagData.name,
      },
    });

    if (existingTag) {
      throw new BadRequestError(
        `Tag name "${tagData.name}" already exists in this guild`
      );
    }

    // Generate unique tag ID
    let tagId: number;
    while (true) {
      tagId = Math.floor(Math.random() * 90000) + 10000; // 10000-99999 like polls
      const existing = await prisma.pollstags.findUnique({
        where: { tag: tagId },
      });
      if (!existing) break;
    }

    const createdTag = await prisma.pollstags.create({
      data: {
        tag: tagId,
        name: tagData.name,
        guild_id: BigInt(tagData.guild_id),
        channel_id: BigInt(tagData.channel_id),
        crosspost_channels:
          tagData.crosspost_channels?.map((id: any) => BigInt(id)) ?? [],
        crosspost_servers:
          tagData.crosspost_servers?.map((id: any) => BigInt(id)) ?? [],
        current_num: tagData.current_num ?? null,
        colour: tagData.colour ?? null,
        end_message: tagData.end_message ?? null,
        end_message_latest_ids:
          tagData.end_message_latest_ids?.map((id: any) => BigInt(id)) ?? [],
        end_message_replace: tagData.end_message_replace ?? false,
        end_message_role_ids:
          tagData.end_message_role_ids?.map((id: any) => BigInt(id)) ?? [],
        end_message_ping: tagData.end_message_ping ?? false,
        end_message_self_assign: tagData.end_message_self_assign ?? false,
        persistent: tagData.persistent ?? true,
      },
    });

    console.log(`Created tag "${createdTag.name}" with ID ${createdTag.tag}`);

    res.status(201).json(createdTag);
  } catch (error) {
    ApiError.sendError(res, error);
  }
});
