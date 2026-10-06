import { prisma } from "@/client";
import { emitBotEvent } from "@/websocket/botEventEmitter";

/**
 * Scheduled lifecycle, API-owned: a write-free periodic sweep that
 * emits synthetic `start`/`end` bot frames for due polls. The sweep
 * never stamps anything — `message_id IS NULL` is the durable
 * "started but not yet rendered" marker (the bot's render report via
 * the publish endpoint clears it, which is the ack that stops the
 * start frames), and end frames are bounded by a lookback window
 * because ended-ness has no ack of its own (the bot's watermark resync
 * covers out-of-window misses).
 *
 * Single-container assumption: no leader election. If the API is ever
 * replicated, the sweep needs shard/leader awareness first (see the
 * X-Shard-Id note in the decoupling plan).
 */

export const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;
export const DEFAULT_END_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function findDueStarts(now: Date): Promise<{ id: number }[]> {
  return prisma.poll.findMany({
    where: { start_time: { lte: now }, message_id: null },
    select: { id: true },
  });
}

export async function findDueEnds(
  now: Date,
  endLookbackMs: number,
): Promise<{ id: number }[]> {
  const since = new Date(now.getTime() - endLookbackMs);
  return prisma.poll.findMany({
    where: {
      end_time: { lte: now, gt: since },
      message_id: { not: null },
    },
    select: { id: true },
  });
}

export interface SweepResult {
  starts: number[];
  ends: number[];
}

export async function sweepPollSchedule(
  now: Date = new Date(),
  endLookbackMs: number = DEFAULT_END_LOOKBACK_MS,
): Promise<SweepResult> {
  const [dueStarts, dueEnds] = await Promise.all([
    findDueStarts(now),
    findDueEnds(now, endLookbackMs),
  ]);
  for (const { id } of dueStarts) emitBotEvent("polls", "start", id);
  for (const { id } of dueEnds) emitBotEvent("polls", "end", id);
  return {
    starts: dueStarts.map((poll) => poll.id),
    ends: dueEnds.map((poll) => poll.id),
  };
}

export function attachPollScheduler(
  intervalMs: number = DEFAULT_SCHEDULER_INTERVAL_MS,
  endLookbackMs: number = DEFAULT_END_LOOKBACK_MS,
  nowFn: () => Date = () => new Date(),
): () => void {
  const tick = () => {
    sweepPollSchedule(nowFn(), endLookbackMs).catch((error) => {
      console.error(`[PollScheduler] Sweep failed: ${error}`);
    });
  };
  tick();
  const interval = setInterval(tick, intervalMs);
  return () => clearInterval(interval);
}
