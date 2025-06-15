import { BadRequestError } from "@/errors";
import type { Poll, Tag, Vote } from "@/types";
import { z } from "zod";

const BooleanFilter = z
  .string()
  .toLowerCase()
  .refine((val) => val === "true" || val === "false", {
    message: "Must be 'true' or 'false'",
  })
  .transform((val) => (val ? val === "true" : undefined))
  .optional();

const IntFilter = z.coerce.number().int().positive();

const BigIntFilter = z.coerce.bigint().positive();

const GuildIdParamModel = z.object({
  guildId: IntFilter,
});

const PollIdParamModel = z.object({
  pollId: IntFilter,
});

const TagIdParamModel = z.object({
  id: IntFilter,
});

const UserIdParamModel = z.object({
  userId: BigIntFilter,
});

const ChoiceParamModel = z.object({
  choice: z.coerce.number().int().min(0).max(7).nullable(),
});

const PaginationModel = z.object({
  page: IntFilter.optional(),
  limit: IntFilter.optional(),
});

const PollFilterParamsModel = z
  .object({
    published: BooleanFilter.optional(),
    tag: IntFilter.optional(),
    userId: BigIntFilter.optional(),
    notVoted: BooleanFilter,
    search: z.coerce.string().optional(),
    ...PaginationModel.shape,
  })
  .refine((data) => !(data.notVoted && !data.userId), {
    message: "'notVoted' requires 'userId' to be specified",
    path: ["notVoted"],
  });

export interface GuildIdParams {
  guildId: string;
}

export async function parseGuildId(
  params: GuildIdParams
): Promise<Poll["guild_id"]> {
  const result = await GuildIdParamModel.safeParseAsync(params);
  if (!result.success) {
    throw new BadRequestError(
      `${params.guildId} is not a valid guild id`,
      result.error.issues
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
      result.error.issues
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

  page?: number;
  limit?: number;
}

export async function parsePollFilterParams(
  params: PollFilterParams
): Promise<PollFilterParams> {
  const result = await PollFilterParamsModel.safeParseAsync(params);

  if (!result.success) {
    throw new BadRequestError(
      "Invalid poll filter parameters",
      result.error.issues
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
      result.error.issues
    );
  }

  return result.data.id;
}

export interface UserIdParams {
  userId: string;
}

export async function parseUserId(
  params: UserIdParams
): Promise<Vote["user_id"]> {
  const result = await UserIdParamModel.safeParseAsync(params);
  if (!result.success) {
    throw new BadRequestError(
      `${params.userId} is not a valid user id`,
      result.error.issues
    );
  }

  return result.data.userId;
}

export interface VoteParams {
  choice: string;
}

export async function parseChoice(
  params: VoteParams
): Promise<Vote["choice"] | null> {
  const result = await ChoiceParamModel.safeParseAsync(params);
  if (!result.success) {
    throw new BadRequestError(
      `${params.choice} is not a valid choice`,
      result.error.issues
    );
  }

  return result.data.choice;
}
