import { describe, expect, it } from "vitest";

import { BadRequestError } from "@/errors";
import {
  type PollFilterParams,
  parsePollFilterParams,
} from "@/models/paramModels";
import { buildPollAuxFilters, mergeAuxFilters } from "@/services/pollService";

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

  it("state=start couples start_time NOT NULL with published=false", () => {
    expect(buildPollAuxFilters({ state: "start" })).toEqual({
      start_time: { not: null },
      published: false,
    });
  });

  it("state=end couples end_time NOT NULL with active=true", () => {
    expect(buildPollAuxFilters({ state: "end" })).toEqual({
      end_time: { not: null },
      active: true,
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

  it("combines ids, num, state, and active_or_persistent into one fragment", () => {
    expect(
      buildPollAuxFilters({
        ids: [1, 2, 3],
        num: 42,
        state: "end",
        active_or_persistent: true,
      })
    ).toEqual({
      id: { in: [1, 2, 3] },
      num: 42,
      end_time: { not: null },
      active: true,
      OR: [{ active: true }, { tagRelation: { persistent: true } }],
    });
  });

  it("does not mutate the params object", () => {
    const params = { ids: [9], num: 1, state: "start" as const };
    buildPollAuxFilters(params);
    expect(params).toEqual({ ids: [9], num: 1, state: "start" });
  });

  it("aux keys win over the base builder when spread last (getPolls merge order)", () => {
    const base = { published: true, guild_id: 123n };
    const filters = { ...base, ...buildPollAuxFilters({ state: "start" }) };

    expect(filters).toEqual({
      published: false,
      guild_id: 123n,
      start_time: { not: null },
    });
  });
});

describe("parsePollFilterParams order=random conflicts", () => {
  it.each([
    [{ num: 7 }],
    [{ state: "start" as const }],
    [{ state: "end" as const }],
    [{ active_or_persistent: "true" }],
    [{ active_or_persistent: "false" }],
  ])("rejects order=random with %o", async (extra) => {
    const promise = parsePollFilterParams({
      order: "random",
      ...extra,
    } as unknown as PollFilterParams);

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      "'num', 'state', and 'active_or_persistent' are not supported with order=random"
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
    expect(parsed.state).toBeUndefined();
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
