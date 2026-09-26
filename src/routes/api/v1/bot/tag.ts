import { Router } from "express";
import { z } from "zod";

import { ApiError, BadRequestError } from "@/errors";
import { requireDiscordRevalidation } from "@/middleware/requireDiscordRevalidation";
import {
	BigIntFilter,
	parseTagFilterParams,
	parseTagId,
	parseUpdateTagBody,
} from "@/models/paramModels";
import {
	createTag,
	getTagById,
	getTags,
	updateTag,
} from "@/services/tagService";

export const botTagRouter = Router();

botTagRouter.get("/", async (req, res) => {
	const filters = await parseTagFilterParams(
		req.query,
	);
	const tags = await getTags(filters);
	res.status(200).json(tags);
});

botTagRouter.get("/:id", async (req, res) => {
	const tagId = await parseTagId(req.params);
	const tag = await getTagById(tagId);
	if (!tag) {
		throw new ApiError(`Tag with id ${tagId} not found`, 404);
	}
	res.status(200).json(tag);
});

botTagRouter.post("/create", requireDiscordRevalidation, async (req, res) => {
	const createdTag = await createTag(req.body);
	res.status(201).json(createdTag);
});

botTagRouter.post("/update", requireDiscordRevalidation, async (req, res) => {
	const { tag, ...fields } = parseUpdateTagBody(req.body);
	const updatedTag = await updateTag(tag, fields);
	res.status(200).json(updatedTag);
});

// End-message bookkeeping shim: the bot's scheduled starts record the
// end-message ids with NO acting Discord user, so unlike /create and
// /update it mounts NO revalidation — trusted beneath the tree-wide
// service-token gate, mirroring the poll lifecycle shims.
const EndMessageLatestIdsBody = z
	.object({
		end_message_latest_ids: z.array(BigIntFilter),
	})
	.strict();

botTagRouter.post(
	"/:id/end-message-latest-ids",
	async (req, res) => {
		const tagId = await parseTagId(req.params);
		const parsed = EndMessageLatestIdsBody.safeParse(req.body);
		if (!parsed.success) {
			throw new BadRequestError(
				"Invalid end-message-latest-ids body",
				parsed.error.issues,
			);
		}
		const updatedTag = await updateTag(tagId, {
			end_message_latest_ids: parsed.data.end_message_latest_ids,
		});
		res.status(200).json(updatedTag);
	},
);
