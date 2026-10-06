import { getBotContext } from "@/context/botContext";

export type BotEventTable = "polls" | "votes" | "tags";
/**
 * `start` and `end` are synthetic lifecycle operations emitted by the
 * poll scheduler sweep (no DB write backs them): start re-emits for
 * polls whose start_time has passed but which have no message_id yet
 * (self-healing until the bot reports its render), end re-emits for
 * rendered polls inside the sweep's lookback window.
 */
export type BotEventOperation =
  | "create"
  | "update"
  | "delete"
  | "start"
  | "end";

export interface BotEventFrame {
  table: BotEventTable;
  operation: BotEventOperation;
  id: number;
}

type BroadcastFn = (frame: BotEventFrame) => void;

let broadcast: BroadcastFn | null = null;

export function setBroadcastFn(fn: BroadcastFn | null): void {
  broadcast = fn;
}

export function emitBotEvent(
  table: BotEventTable,
  operation: BotEventOperation,
  id: number,
): void {
  if (getBotContext()?.isBotCall === true) return;
  broadcast?.({ table, operation, id });
}
