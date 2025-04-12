import { BadRequestError } from "@/errors";
import type { Poll } from "@/types/poll";
import type { Tag } from "@/types/tag";
import type { Vote } from "@/types/vote";
import { z } from "zod";

const GuildIdParamModel = z.object({
	guildId: z.coerce.number().int().positive(),
});

const PollIdParamModel = z.object({
	pollId: z.coerce.number().int().positive(),
});

const TagIdParamModel = z.object({
	id: z.coerce.number().int().positive(),
});

const UserIdParamModel = z.object({
	userId: z.coerce.bigint().positive(),
});

export const PollFilterParamsModel = z
	.object({
		published: z.coerce.boolean().optional(),
		tag: z.coerce.number().int().positive().optional(),
		userId: z.coerce.bigint().positive().optional(),
		notVoted: z.coerce
			.boolean()
			.transform(() => true)
			.optional(),
		search: z.coerce.string().optional(),
	})
	.refine((data) => !(data.notVoted && !data.userId), {
		message: "'notVoted' requires 'userId' to be specified",
		path: ["notVoted"],
	});

export interface GuildIdParams {
	guildId: string;
}

export async function parseGuildId(
	params: GuildIdParams,
): Promise<Poll["guild_id"]> {
	const result = await GuildIdParamModel.safeParseAsync(params);
	if (!result.success) {
		throw new BadRequestError(
			`${params.guildId} is not a valid guild id`,
			result.error.issues,
		);
	}

	return BigInt(result.data.guildId);
}

export interface PollIdParams {
	pollId: string;
}

export async function parsePollId(params: PollIdParams): Promise<Poll["id"]> {
	const result = await PollIdParamModel.safeParseAsync(params);
	if (!result.success) {
		throw new BadRequestError(
			`${params.pollId} is not a valid poll id`,
			result.error.issues,
		);
	}

	return result.data.pollId;
}

export interface PollFilterParams {
	published?: boolean;
	tag?: number;
	userId?: bigint;
	notVoted?: boolean;
	search?: string;
}

export async function parsePollFilterParams(
	params: PollFilterParams,
): Promise<PollFilterParams> {
	const result = await PollFilterParamsModel.safeParseAsync(params);
	if (!result.success) {
		throw new BadRequestError(
			"Invalid poll filter parameters",
			result.error.issues,
		);
	}

	return result.data;
}

export interface TagIdParams {
	id: string;
}

export async function parseTagId(params: TagIdParams): Promise<Tag["tag"]> {
	const result = await TagIdParamModel.safeParseAsync(params);
	if (!result.success) {
		throw new BadRequestError(
			`${params.id} is not a valid tag id`,
			result.error.issues,
		);
	}

	return result.data.id;
}

export interface UserIdParams {
	userId: string;
}

export async function parseUserId(
	params: UserIdParams,
): Promise<Vote["user_id"]> {
	const result = await UserIdParamModel.safeParseAsync(params);
	if (!result.success) {
		throw new BadRequestError(
			`${params.userId} is not a valid user id`,
			result.error.issues,
		);
	}

	return result.data.userId;
}
