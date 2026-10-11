import { Prisma } from "@/generated/prisma/client";

/**
 * User filtering options for polls
 */
export interface PollFilterUser {
  userId: bigint;
  notVoted?: boolean;
}

/**
 * Builds the derived-published where fragment: started (start_time
 * passed). NULL start_time fails the comparison, so no explicit
 * not-null is needed (SQL semantics). One helper, two consumers: the
 * `published` filter and derived-active.
 */
export function derivedPublishedWhere(now: Date): Prisma.PollWhereInput {
  return { start_time: { lte: now } };
}

/**
 * Builds the derived-active where fragment: started and not ended
 * (open-ended polls count as not ended). One helper, two consumers:
 * the `active` filter and the derived arm of the `live` filter.
 */
function derivedActiveWhere(now: Date): Prisma.PollWhereInput {
  return {
    start_time: { lte: now },
    OR: [{ end_time: null }, { end_time: { gt: now } }],
  };
}

/**
 * Builds the derived-unpublished where fragment: drafts (NULL
 * start_time) OR scheduled (start_time still in the future). Written
 * as an explicit OR instead of NOT derivedPublishedWhere because SQL
 * three-valued logic would drop drafts (NULL <= now is NULL, NOT NULL
 * is NULL, NULL excludes the row).
 */
export function derivedUnpublishedWhere(now: Date): Prisma.PollWhereInput {
  return { OR: [{ start_time: null }, { start_time: { gt: now } }] };
}

/**
 * Builds the derived-inactive where fragment: not started (draft or
 * scheduled) OR ended. Written as an explicit OR instead of NOT
 * derivedActiveWhere because SQL three-valued logic would drop drafts
 * (a NULL start_time makes the NOT evaluate to NULL and exclude the
 * row). The end_time arm is NULL-safe on its own: an open-ended
 * started poll yields NULL there and correctly stays active.
 */
function derivedInactiveWhere(now: Date): Prisma.PollWhereInput {
  return {
    OR: [
      { start_time: null },
      { start_time: { gt: now } },
      { end_time: { lte: now } },
    ],
  };
}

/**
 * Builds the bot-facing aux list filters (ids, num, published, active,
 * has_start, has_end, live, pending_render, ended_since) as an array
 * of conjuncts for AND-appending. Pure — no DB access — so it can be
 * unit tested directly and composed into the list path's filters
 * object. Each conjunct is self-contained: no fragment ever writes a
 * top-level OR into the shared filters.
 */
export function buildPollAuxFilters(
  params: {
    ids?: number[];
    published?: boolean;
    num?: number;
    active?: boolean;
    has_start?: boolean;
    has_end?: boolean;
    live?: boolean;
    pending_render?: boolean;
    ended_since?: Date;
  },
  now: Date = new Date(),
): Prisma.PollWhereInput[] {
  const conjuncts: Prisma.PollWhereInput[] = [];
  if (params.ids?.length) conjuncts.push({ id: { in: params.ids } });
  if (params.num !== undefined) conjuncts.push({ num: params.num });
  if (params.published === true) conjuncts.push(derivedPublishedWhere(now));
  else if (params.published === false)
    conjuncts.push(derivedUnpublishedWhere(now));
  if (params.active === true) conjuncts.push(derivedActiveWhere(now));
  else if (params.active === false)
    conjuncts.push(derivedInactiveWhere(now));
  if (params.has_start === true) conjuncts.push({ start_time: { not: null } });
  else if (params.has_start === false) conjuncts.push({ start_time: null });
  if (params.has_end === true) conjuncts.push({ end_time: { not: null } });
  else if (params.has_end === false) conjuncts.push({ end_time: null });
  if (params.live === true) {
    conjuncts.push({
      OR: [derivedActiveWhere(now), { tagRelation: { persistent: true } }],
    });
  }
  if (params.pending_render === true) {
    conjuncts.push({ start_time: { lte: now }, message_id: null });
  }
  if (params.ended_since !== undefined) {
    conjuncts.push({
      end_time: { lte: now, gt: params.ended_since },
      message_id: { not: null },
    });
  }
  return conjuncts;
}
