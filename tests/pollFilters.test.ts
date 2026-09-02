import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "@/app";
import { BadRequestError } from "@/errors";
import {
  type PollFilterParams,
  parsePollFilterParams,
} from "@/models/paramModels";
import { buildPollAuxFilters, mergeAuxFilters } from "@/services/pollService";
import { FIXTURE_GUILD_ID } from "./fixtures";

const GUILD = FIXTURE_GUILD_ID.toString();

let app: Express;

beforeAll(async () => {
  app = await createApp();
});

describe("buildPollAuxFilters", () => {
  it("returns an empty object for empty params", () => {
    expect(buildPollAuxFilters({})).toEqual({});
  });

  it("maps ids to an id IN filter", () => {
    expect(buildPollAuxFilters({ ids: [12345, 67890] })).toEqual({
      id: { in: [12345, 67890] },
    });
  });

  it("adds no id filter for an empty ids array", () => {
    expect(buildPollAuxFilters({ ids: [] })).toEqual({});
  });

  it("maps num to an equality filter", () => {
    expect(buildPollAuxFilters({ num: 7 })).toEqual({ num: 7 });
  });

  it("active=true maps to an active equality filter", () => {
    expect(buildPollAuxFilters({ active: true })).toEqual({ active: true });
  });

  it("active=false maps to an active equality filter", () => {
    expect(buildPollAuxFilters({ active: false })).toEqual({ active: false });
  });

  it("has_start=true maps to start_time IS NOT NULL", () => {
    expect(buildPollAuxFilters({ has_start: true })).toEqual({
      start_time: { not: null },
    });
  });

  it("has_start=false maps to start_time IS NULL (literal null)", () => {
    expect(buildPollAuxFilters({ has_start: false })).toEqual({
      start_time: null,
    });
  });

  it("has_end=true maps to end_time IS NOT NULL", () => {
    expect(buildPollAuxFilters({ has_end: true })).toEqual({
      end_time: { not: null },
    });
  });

  it("has_end=false maps to end_time IS NULL (literal null)", () => {
    expect(buildPollAuxFilters({ has_end: false })).toEqual({
      end_time: null,
    });
  });

  it("combines has_start=false with has_end=true", () => {
    expect(buildPollAuxFilters({ has_start: false, has_end: true })).toEqual({
      start_time: null,
      end_time: { not: null },
    });
  });

  it("active_or_persistent=true builds the active/persistent OR fragment", () => {
    expect(buildPollAuxFilters({ active_or_persistent: true })).toEqual({
      OR: [{ active: true }, { tagRelation: { persistent: true } }],
    });
  });

  it("active_or_persistent=false adds no filter", () => {
    expect(buildPollAuxFilters({ active_or_persistent: false })).toEqual({});
  });

  it("combines ids, num, and the boolean predicates into one fragment", () => {
    expect(
      buildPollAuxFilters({
        ids: [1, 2, 3],
        num: 42,
        active: true,
        has_end: true,
        active_or_persistent: true,
      })
    ).toEqual({
      id: { in: [1, 2, 3] },
      num: 42,
      active: true,
      end_time: { not: null },
      OR: [{ active: true }, { tagRelation: { persistent: true } }],
    });
  });

  it("does not mutate the params object", () => {
    const params = { ids: [9], num: 1, active: false, has_end: true };
    buildPollAuxFilters(params);
    expect(params).toEqual({ ids: [9], num: 1, active: false, has_end: true });
  });
});

describe("parsePollFilterParams order=random conflicts", () => {
  it.each([
    [{ num: 7 }],
    [{ active: "true" }],
    [{ active: "false" }],
    [{ has_start: "true" }],
    [{ has_start: "false" }],
    [{ has_end: "true" }],
    [{ has_end: "false" }],
    [{ active_or_persistent: "true" }],
    [{ active_or_persistent: "false" }],
  ])("rejects order=random with %o", async (extra) => {
    const promise = parsePollFilterParams({
      order: "random",
      ...extra,
    } as unknown as PollFilterParams);

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      "'num', 'active', 'active_or_persistent', 'has_start', and 'has_end' are not supported with order=random"
    );
  });

  it("accepts order=random with ids alone", async () => {
    const parsed = await parsePollFilterParams({
      order: "random",
      ids: "12345,67890",
    } as unknown as PollFilterParams);

    expect(parsed.order).toBe("random");
    expect(parsed.ids).toEqual([12345, 67890]);
    expect(parsed.num).toBeUndefined();
    expect(parsed.active).toBeUndefined();
    expect(parsed.has_start).toBeUndefined();
    expect(parsed.has_end).toBeUndefined();
    expect(parsed.active_or_persistent).toBeUndefined();
  });
});

describe("parsePollFilterParams ids/userId conflicts", () => {
  it("rejects ids combined with userId", async () => {
    const promise = parsePollFilterParams({
      ids: "12345,67890",
      userId: "111111111111111111",
    } as unknown as PollFilterParams);

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      "'ids' cannot be combined with 'userId'"
    );
  });

  it("parses ids alone", async () => {
    const parsed = await parsePollFilterParams({
      ids: "12345,67890",
    } as unknown as PollFilterParams);

    expect(parsed.ids).toEqual([12345, 67890]);
    expect(parsed.userId).toBeUndefined();
  });

  it("parses userId alone", async () => {
    const parsed = await parsePollFilterParams({
      userId: "111111111111111111",
    } as unknown as PollFilterParams);

    expect(parsed.userId).toBe(111111111111111111n);
    expect(parsed.ids).toBeUndefined();
  });
});

describe("mergeAuxFilters", () => {
  it("plain-merges when neither side has an OR", () => {
    expect(
      mergeAuxFilters({ published: true, guild_id: 123n }, { num: 7 }),
    ).toEqual({
      published: true,
      guild_id: 123n,
      num: 7,
    });
  });

  it("preserves a base-only OR", () => {
    const baseOr = [{ question: { contains: "comic" } }];

    expect(mergeAuxFilters({ OR: baseOr }, { num: 7 })).toEqual({
      OR: baseOr,
      num: 7,
    });
  });

  it("preserves an aux-only OR", () => {
    const auxOr = [{ active: true }, { tagRelation: { persistent: true } }];

    expect(mergeAuxFilters({ published: true }, { OR: auxOr })).toEqual({
      published: true,
      OR: auxOr,
    });
  });

  it("lifts colliding ORs into AND groups with both preserved", () => {
    const baseOr = [{ question: { contains: "comic" } }];
    const auxOr = [{ active: true }, { tagRelation: { persistent: true } }];

    const merged = mergeAuxFilters(
      { published: true, OR: baseOr },
      { num: 3, OR: auxOr },
    );

    expect(merged).toEqual({
      published: true,
      num: 3,
      AND: [{ OR: baseOr }, { OR: auxOr }],
    });
    expect(merged.OR).toBeUndefined();
  });

  it("keeps existing base AND entries when lifting colliding ORs", () => {
    const baseOr = [{ question: { contains: "comic" } }];
    const auxOr = [{ active: true }];

    const merged = mergeAuxFilters(
      { AND: [{ num: 1 }], OR: baseOr },
      { OR: auxOr },
    );

    expect(merged.AND).toEqual([{ num: 1 }, { OR: baseOr }, { OR: auxOr }]);
  });

  it("aux non-OR keys still win over the base keys", () => {
    expect(
      mergeAuxFilters({ published: true }, { published: false, num: 42 }),
    ).toEqual({ published: false, num: 42 });
  });
});

describe("GET /api/v1/polls unpublished gate", () => {
  it("returns 403 for published=false without an OAuth session", async () => {
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&published=false`,
    );
    expect(response.status).toBe(403);
  });
});
