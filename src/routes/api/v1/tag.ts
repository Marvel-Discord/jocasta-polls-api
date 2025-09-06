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
    const tagId = await parseTagId(req.query as unknown as TagIdParams);
    const tag = await getTagById(tagId);
    if (!tag) {
      throw new ApiError(`Tag with id ${tagId} not found`, 404);
    }
    res.status(200).json(tag);
  } catch (error) {
    ApiError.sendError(res, error);
  }
});
