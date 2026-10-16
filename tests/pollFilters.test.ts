import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "@/app";
import { BadRequestError } from "@/errors";
import {
  type PollFilterParams,
  parsePollFilterParams,
} from "@/models/paramModels";
import { buildPollAuxFilters } from "@/services/pollFilters";
import { FIXTURE_GUILD_ID } from "./fixtures";

const GUILD = FIXTURE_GUILD_ID.toString();

// Injected clock for the derived-active filters: keeps the builder truth
// tables deterministic (route-level determinism comes from far-dated
// fixture polls instead).
const NOW = new Date("2026-06-15T12:00:00.000Z");

const DERIVED_ACTIVE = {
  start_time: { lte: NOW },
  OR: [{ end_time: null }, { end_time: { gt: NOW } }],
};

let app: Express;

beforeAll(async () => {
  app = await createApp();
});

describe("buildPollAuxFilters", () => {
  it("returns an empty conjunct array for empty params", () => {
    expect(buildPollAuxFilters({}, NOW)).toEqual([]);
  });

  it("maps ids to a single id IN conjunct", () => {
    expect(buildPollAuxFilters({ ids: [12345, 67890] }, NOW)).toEqual([
      { id: { in: [12345, 67890] } },
    ]);
  });

  it("adds no conjunct for an empty ids array", () => {
    expect(buildPollAuxFilters({ ids: [] }, NOW)).toEqual([]);
  });

  it("maps id_prefix_range to a single id gte/lte conjunct", () => {
    expect(
      buildPollAuxFilters({ id_prefix_range: { gte: 44000, lte: 44999 } }, NOW),
    ).toEqual([{ id: { gte: 44000, lte: 44999 } }]);
  });

  it("combines id_prefix_range with ids as separate conjuncts", () => {
    expect(
      buildPollAuxFilters(
        { ids: [44123], id_prefix_range: { gte: 44000, lte: 44999 } },
        NOW,
      ),
    ).toEqual([{ id: { in: [44123] } }, { id: { gte: 44000, lte: 44999 } }]);
  });

  it("maps num to a single equality conjunct", () => {
    expect(buildPollAuxFilters({ num: 7 }, NOW)).toEqual([{ num: 7 }]);
  });

  it("published=true → derived conjunct (started)", () => {
    expect(buildPollAuxFilters({ published: true }, NOW)).toEqual([
      { start_time: { lte: NOW } },
    ]);
  });

  it("published=false → drafts-or-scheduled OR conjunct (drafts + scheduled)", () => {
    // 3VL-safe complement: NOT {start_time <= now} would evaluate to
    // NULL for drafts (NULL start) and exclude them.
    expect(buildPollAuxFilters({ published: false }, NOW)).toEqual([
      { OR: [{ start_time: null }, { start_time: { gt: NOW } }] },
    ]);
  });

  it("active conjunct no longer references published", () => {
    const conjuncts = buildPollAuxFilters({ active: true }, NOW);
    expect(conjuncts).toEqual([
      {
        start_time: { lte: NOW },
        OR: [{ end_time: null }, { end_time: { gt: NOW } }],
      },
    ]);
  });

  it("active=false → not-started-or-ended OR conjunct (3VL-safe complement)", () => {
    // NOT the derived-active object would drop drafts (NULL start);
    // the end_time lte arm alone is NULL-safe for open-ended polls.
    expect(buildPollAuxFilters({ active: false }, NOW)).toEqual([
      {
        OR: [
          { start_time: null },
          { start_time: { gt: NOW } },
          { end_time: { lte: NOW } },
        ],
      },
    ]);
  });

  it("live=true ORs the derived-active object with the persistent-tag arm", () => {
    expect(buildPollAuxFilters({ live: true }, NOW)).toEqual([
      { OR: [DERIVED_ACTIVE, { tagRelation: { persistent: true } }] },
    ]);
  });

  it("live=false adds no conjunct", () => {
    expect(buildPollAuxFilters({ live: false }, NOW)).toEqual([]);
  });

  it("has_start=true maps to a start_time IS NOT NULL conjunct", () => {
    expect(buildPollAuxFilters({ has_start: true }, NOW)).toEqual([
      { start_time: { not: null } },
    ]);
  });

  it("has_start=false maps to a start_time IS NULL conjunct (literal null)", () => {
    expect(buildPollAuxFilters({ has_start: false }, NOW)).toEqual([
      { start_time: null },
    ]);
  });

  it("has_end=true maps to an end_time IS NOT NULL conjunct", () => {
    expect(buildPollAuxFilters({ has_end: true }, NOW)).toEqual([
      { end_time: { not: null } },
    ]);
  });

  it("has_end=false maps to an end_time IS NULL conjunct (literal null)", () => {
    expect(buildPollAuxFilters({ has_end: false }, NOW)).toEqual([
      { end_time: null },
    ]);
  });

  it("combines has_start=false with has_end=true as two conjuncts", () => {
    expect(
      buildPollAuxFilters({ has_start: false, has_end: true }, NOW),
    ).toEqual([{ start_time: null }, { end_time: { not: null } }]);
  });

  it("combines ids, num, and the boolean predicates into one conjunct per filter", () => {
    expect(
      buildPollAuxFilters(
        {
          ids: [1, 2, 3],
          num: 42,
          active: true,
          has_end: true,
          live: true,
        },
        NOW,
      ),
    ).toEqual([
      { id: { in: [1, 2, 3] } },
      { num: 42 },
      DERIVED_ACTIVE,
      { end_time: { not: null } },
      { OR: [DERIVED_ACTIVE, { tagRelation: { persistent: true } }] },
    ]);
  });

  it("open-ended polls stay in scope: the derived object's OR keeps the end_time null arm", () => {
    const [conjunct] = buildPollAuxFilters({ active: true }, NOW);
    expect(conjunct.OR).toContainEqual({ end_time: null });
    const [liveConjunct] = buildPollAuxFilters({ live: true }, NOW);
    expect(liveConjunct.OR?.[0]?.OR).toContainEqual({ end_time: null });
  });

  it("does not mutate the params object", () => {
    const params = { ids: [9], num: 1, active: false, has_end: true };
    buildPollAuxFilters(params, NOW);
    expect(params).toEqual({ ids: [9], num: 1, active: false, has_end: true });
  });

  it("pending_render=true → started-but-unrendered conjunct", () => {
    expect(buildPollAuxFilters({ pending_render: true }, NOW)).toEqual([
      { start_time: { lte: NOW }, message_id: null },
    ]);
  });

  it("ended_since → rendered, ended-in-window conjunct", () => {
    const since = new Date("2024-01-01T00:00:00.000Z");
    expect(buildPollAuxFilters({ ended_since: since }, NOW)).toEqual([
      {
        end_time: { lte: NOW, gt: since },
        message_id: { not: null },
      },
    ]);
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
    [{ live: "true" }],
    [{ live: "false" }],
  ])("rejects order=random with %o", async (extra) => {
    const promise = parsePollFilterParams({
      order: "random",
      ...extra,
    } as unknown as PollFilterParams);

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      "'num', 'active', 'live', 'has_start', 'has_end', 'pending_render', and 'ended_since' are not supported with order=random"
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
    expect(parsed.live).toBeUndefined();
  });

  it("rejects pending_render/ended_since with order=random", async () => {
    await expect(
      parsePollFilterParams({ order: "random", pending_render: "true" }),
    ).rejects.toThrow(
      "'num', 'active', 'live', 'has_start', 'has_end', 'pending_render', and 'ended_since'",
    );
    await expect(
      parsePollFilterParams({ order: "random", ended_since: "2024-01-01" }),
    ).rejects.toThrow();
  });

  it("rejects a non-date ended_since", async () => {
    await expect(
      parsePollFilterParams({ ended_since: "not a date" }),
    ).rejects.toThrow();
  });

  it("rejects pending_render=false (no complement exists)", async () => {
    await expect(
      parsePollFilterParams({ pending_render: "false" }),
    ).rejects.toThrow("'pending_render' only accepts 'true'");
  });

  it("parses ended_since into a Date", async () => {
    const parsed = await parsePollFilterParams({
      ended_since: "2024-01-01T00:00:00.000Z",
    });
    expect(parsed.ended_since).toEqual(new Date("2024-01-01T00:00:00.000Z"));
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

describe("parsePollFilterParams id_prefix translation", () => {
  // Poll ids are 5-digit (10000-99999 generator): a prefix of length L
  // pads to the decade range covering it; L=5 degenerates to the exact id.
  it.each([
    ["4", { gte: 40000, lte: 49999 }],
    ["44", { gte: 44000, lte: 44999 }],
    ["449", { gte: 44900, lte: 44999 }],
    ["4412", { gte: 44120, lte: 44129 }],
    ["44123", { gte: 44123, lte: 44123 }],
  ])("translates id_prefix=%s to %o", async (prefix, range) => {
    const parsed = await parsePollFilterParams({ id_prefix: prefix });

    expect(parsed.id_prefix_range).toEqual(range);
  });

  it("rejects a non-digit id_prefix", async () => {
    await expect(
      parsePollFilterParams({ id_prefix: "4a12" }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(parsePollFilterParams({ id_prefix: "abc" })).rejects.toThrow();
  });

  it("rejects an empty id_prefix", async () => {
    await expect(parsePollFilterParams({ id_prefix: "" })).rejects.toThrow();
  });

  it("rejects an id_prefix longer than 5 digits (no possible id)", async () => {
    await expect(
      parsePollFilterParams({ id_prefix: "123456" }),
    ).rejects.toThrow(
      "'id_prefix' exceeds the maximum id length of 5 digits",
    );
  });

  it("omits id_prefix_range when id_prefix is absent", async () => {
    const parsed = await parsePollFilterParams({ published: "true" });

    expect(parsed.id_prefix_range).toBeUndefined();
  });

  it("accepts id_prefix with order=random (sampler composition)", async () => {
    const parsed = await parsePollFilterParams({
      order: "random",
      id_prefix: "4",
    });

    expect(parsed.order).toBe("random");
    expect(parsed.id_prefix_range).toEqual({ gte: 40000, lte: 49999 });
  });
});

describe("GET /api/v1/polls id_prefix", () => {
  it("threads the translated id range: no 5-digit fixture id matches prefix 1", async () => {
    // Unauthenticated requests force published=true; fixture ids 1-6 all
    // fall below the translated 10000-19999 range, so an ignored (or
    // mis-threaded) param would return the published set instead of [].
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&id_prefix=1`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });
});

describe("GET /api/v1/polls unpublished gate", () => {
  it("returns 403 for published=false without an OAuth session", async () => {
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&published=false`,
    );
    expect(response.status).toBe(403);
  });

  it("unauthenticated active=false derives only published inactive polls (forced published:true composes via AND)", async () => {
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&active=false`,
    );

    expect(response.status).toBe(200);
    // P5 (started, ended) is the only started inactive poll; the
    // not-yet-started P3 and the draft P6 now match the active=false
    // OR conjunct, but the route's forced published:true must exclude
    // them (AND composition).
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([5]);
    expect(
      response.body.data.every((poll: any) => poll.published === true),
    ).toBe(true);
  });
});
