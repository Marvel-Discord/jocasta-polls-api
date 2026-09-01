import { describe, expect, it } from "vitest";

import { buildPollAuxFilters } from "@/services/pollService";

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
