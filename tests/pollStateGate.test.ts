import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "@/app";
import { FIXTURE_GUILD_ID } from "./fixtures";

const GUILD = FIXTURE_GUILD_ID.toString();

let app: Express;

beforeAll(async () => {
  app = await createApp();
});

describe("GET /api/v1/polls unpublished gate", () => {
  it("returns 403 for state=start without an OAuth session", async () => {
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&state=start`,
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 for published=false without an OAuth session", async () => {
    const response = await request(app).get(
      `/api/v1/polls?guildId=${GUILD}&published=false`,
    );
    expect(response.status).toBe(403);
  });
});
