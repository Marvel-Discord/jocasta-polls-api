import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "@/app";
import { FIXTURE_GUILD_ID, FIXTURE_USER_ID } from "./fixtures";

let app: Express;
const TOKEN = process.env.BOT_SERVICE_TOKEN!;
const GUILD = FIXTURE_GUILD_ID.toString();

beforeAll(async () => {
  app = await createApp();
});

function assertContractShape(poll: any) {
  for (const field of ["start_time", "end_time", "time", "votes", "total_votes"]) {
    expect(poll).toHaveProperty(field);
  }
  expect(Array.isArray(poll.votes)).toBe(true);
  expect(typeof poll.total_votes).toBe("number");
  expect(poll.time).toBe(poll.start_time);
  expect(poll).not.toHaveProperty("tagRelation");
}

describe("bot poll reads", () => {
  it("lists polls with the full contract shape and visible tallies", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([4, 2, 1]);
    response.body.data.forEach(assertContractShape);
    expect(response.body.meta).toEqual({
      total: 3,
      page: 1,
      limit: 10,
      totalPages: 1,
      nextPage: null,
      prevPage: null,
    });
  });

  it("rejects unauthenticated requests with 401", async () => {
    const response = await request(app).get(`/api/v1/bot/polls?guildId=${GUILD}`);
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message");
  });

  it("allows published=false directly (bot privilege): only the unpublished P3", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}&published=false`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([3]);
  });

  it("returns a single poll contract shape; unknown id gives 404", async () => {
    const response = await request(app)
      .get("/api/v1/bot/polls/1")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    assertContractShape(response.body);
    expect(response.body.id).toBe(1);
    expect(response.body.votes).toEqual([2, 1]);
    expect(response.body.total_votes).toBe(3);
    expect(response.body.start_time).toBe("2026-01-15T12:00:00.000Z");
    expect(response.body.end_time).toBeNull();
    expect(response.body.guild_id).toBe(GUILD);

    const missing = await request(app)
      .get("/api/v1/bot/polls/999")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(missing.status).toBe(404);
  });

  it("returns aggregated vote counts for a hidden-voting poll (override)", async () => {
    const response = await request(app)
      .get("/api/v1/bot/polls/2/votes")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { choice: 0, votes: 1 },
      { choice: 1, votes: 1 },
    ]);
  });

  it("maps votes lookups for unknown polls to 404", async () => {
    const response = await request(app)
      .get("/api/v1/bot/polls/999/votes")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("message");
  });

  it("returns all of a user's votes as an array", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls/votes/${FIXTURE_USER_ID}`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((vote: any) => vote.poll_id)).toEqual([1, 2]);
    response.body.forEach((vote: any) => {
      expect(vote.user_id).toBe(FIXTURE_USER_ID.toString());
    });
  });

  it("sync returns every poll including unpublished with offset pagination", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls/sync?guildId=${GUILD}`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([3, 4, 2, 1]);
    response.body.data.forEach(assertContractShape);
    expect(response.body.meta.total).toBe(4);

    const secondPage = await request(app)
      .get(`/api/v1/bot/polls/sync?guildId=${GUILD}&page=2&limit=2`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.map((poll: any) => poll.id)).toEqual([2, 1]);
    expect(secondPage.body.meta).toEqual({
      total: 4,
      page: 2,
      limit: 2,
      totalPages: 2,
      nextPage: null,
      prevPage: 1,
    });
  });

  it("start-timer composition (published=false&has_start=true) returns the scheduled poll only", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}&published=false&has_start=true`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([3]);
  });

  it("end-timer composition (active=true&has_end=true) returns the end-scheduled poll only", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}&active=true&has_end=true`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([4]);
  });

  it("filters polls without an end time (null-literal matcher)", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}&has_end=false`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([2, 1]);
  });

  it("active_or_persistent=true passes through to active/persistent polls", async () => {
    const response = await request(app)
      .get(`/api/v1/bot/polls?guildId=${GUILD}&active_or_persistent=true`)
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((poll: any) => poll.id)).toEqual([4, 2, 1]);
  });
});
