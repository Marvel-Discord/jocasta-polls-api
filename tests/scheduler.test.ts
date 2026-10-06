import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_END_LOOKBACK_MS,
  attachPollScheduler,
  findDueEnds,
  findDueStarts,
  sweepPollSchedule,
} from "@/services/pollSchedulerService";
import {
  setBroadcastFn,
  type BotEventFrame,
} from "@/websocket/botEventEmitter";
import { FIXTURE_POLLS } from "./fixtures";

// Between P3_START (2030-06-01, passed) and P4_END (2030-07-01, future).
const MID_2030 = new Date("2030-06-15T12:00:00.000Z");
// One hour after P4_END.
const AFTER_P4_END = new Date("2030-07-01T13:00:00.000Z");
// Wide enough to reach P5_END (2024-05-01) from AFTER_P4_END.
const SEVEN_YEARS_MS = 7 * 365 * 24 * 60 * 60 * 1000;

let frames: BotEventFrame[] = [];

describe("poll scheduler sweep", () => {
  beforeEach(() => {
    frames = [];
    setBroadcastFn((frame) => frames.push(frame));
  });
  afterEach(() => {
    setBroadcastFn(null);
  });

  it("findDueStarts returns started-but-unrendered polls only", async () => {
    // At MID_2030: P3 started (2030-06-01) with message_id null.
    // P1/P2/P4/P5 are rendered; P3 is the only unrendered start.
    const starts = await findDueStarts(MID_2030);
    expect(starts.map((p) => p.id)).toEqual([3]);
  });

  it("stops flagging a start once message_id is recorded", async () => {
    const p3 = FIXTURE_POLLS.find((p) => p.id === 3)!;
    const original = p3.message_id;
    p3.message_id = 1099n;
    try {
      const starts = await findDueStarts(MID_2030);
      expect(starts).toEqual([]);
    } finally {
      p3.message_id = original;
    }
  });

  it("findDueEnds returns rendered polls ended inside the lookback window", async () => {
    // At AFTER_P4_END with the 24h default: P4 ended 1h ago → in.
    const recent = await findDueEnds(AFTER_P4_END, DEFAULT_END_LOOKBACK_MS);
    expect(recent.map((p) => p.id)).toEqual([4]);

    // Widened to 7y: P5 (ended 2024-05-01) also in; P3 has no end; the
    // rendered open-ended polls have NULL end_time and never match.
    const wide = await findDueEnds(AFTER_P4_END, SEVEN_YEARS_MS);
    expect(wide.map((p) => p.id)).toEqual([4, 5]);
  });

  it("excludes end dates still in the future", async () => {
    // At MID_2030 P4's end (2030-07-01) is still future.
    const ends = await findDueEnds(MID_2030, SEVEN_YEARS_MS);
    expect(ends.map((p) => p.id)).toEqual([5]);
  });

  it("emits start and end frames through the broadcast", async () => {
    const result = await sweepPollSchedule(MID_2030, SEVEN_YEARS_MS);
    expect(result.starts).toEqual([3]);
    expect(result.ends).toEqual([5]);
    expect(frames).toContainEqual({
      table: "polls",
      operation: "start",
      id: 3,
    });
    expect(frames).toContainEqual({
      table: "polls",
      operation: "end",
      id: 5,
    });
  });

  it("re-emits a start frame on every tick until rendered (self-healing ack)", async () => {
    await sweepPollSchedule(MID_2030);
    await sweepPollSchedule(MID_2030);
    const startFrames = frames.filter(
      (f) => f.id === 3 && f.operation === "start",
    );
    expect(startFrames).toHaveLength(2);
  });
});

describe("attachPollScheduler", () => {
  beforeEach(() => {
    frames = [];
    setBroadcastFn((frame) => frames.push(frame));
  });
  afterEach(() => {
    setBroadcastFn(null);
  });

  it("sweeps immediately and on each interval tick; detach stops it", async () => {
    vi.useFakeTimers();
    try {
      const detach = attachPollScheduler(1_000, DEFAULT_END_LOOKBACK_MS, () => MID_2030);
      await vi.advanceTimersByTimeAsync(0);
      expect(frames.some((f) => f.id === 3 && f.operation === "start")).toBe(true);

      frames = [];
      await vi.advanceTimersByTimeAsync(1_000);
      expect(frames.some((f) => f.id === 3 && f.operation === "start")).toBe(true);

      detach();
      frames = [];
      await vi.advanceTimersByTimeAsync(5_000);
      expect(frames).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
