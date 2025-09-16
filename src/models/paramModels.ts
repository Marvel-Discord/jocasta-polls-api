import { BadRequestError } from "@/errors";
import type { Poll, Tag, Vote } from "@/types";
import { z } from "zod";
import { OrderType, OrderDir } from "@/types";

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
  guildId: BigIntFilter,
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
    // ordering: one of 'time' | 'votes' | 'random'
    order: z
      .enum([OrderType.Time, OrderType.Votes, OrderType.Random])
      .optional(),
    // direction for time/votes: 'asc'|'desc'
    orderDir: z.enum([OrderDir.Asc, OrderDir.Desc]).optional(),
    // seed for random ordering (string form will be coerced to number)
    seed: z.string().optional(),
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
  order?: OrderType;
  orderDir?: OrderDir;
  seed?: number;
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

  // Additional validation for orderDir/seed depending on order
  const parsed: PollFilterParams = {
    published: result.data.published,
    tag: result.data.tag,
    userId: result.data.userId,
    notVoted: result.data.notVoted,
    search: result.data.search,
    page: result.data.page,
    limit: result.data.limit,
  };

  if (result.data.order) {
    parsed.order = result.data.order;

    // validate orderDir/seed
    if (result.data.order === "random") {
      if (result.data.seed !== undefined) {
        if (!/^-?\d+$/.test(result.data.seed)) {
          throw new BadRequestError("seed must be an integer for random order");
        }
        parsed.seed = Number(result.data.seed);
      }
    } else {
      if (result.data.orderDir !== undefined) {
        const low = result.data.orderDir as string;
        if (low !== OrderDir.Asc && low !== OrderDir.Desc) {
          throw new BadRequestError(
            "orderDir must be 'asc' or 'desc' for time/votes order"
          );
        }
        parsed.orderDir = low === OrderDir.Asc ? OrderDir.Asc : OrderDir.Desc;
      }
    }
  } else if (result.data.orderDir || result.data.seed) {
    // orderDir/seed specified without order is invalid
    throw new BadRequestError(
      "'orderDir' or 'seed' is only valid when 'order' is specified"
    );
  }

  return parsed;
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
