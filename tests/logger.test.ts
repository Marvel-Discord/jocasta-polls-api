import { describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import pino from "pino";
import pinoHttp from "pino-http";

import { buildLogger, logger, moduleLogger, pinoHttpOptions } from "@/logger";

class CaptureStream {
  lines: string[] = [];

  write(chunk: string) {
    this.lines.push(chunk);
  }
}

type RequestRecord = {
  level: number;
  req: { headers: Record<string, unknown> };
  res: { statusCode: number; headers: Record<string, unknown> };
};

function requestRecords(stream: CaptureStream) {
  return stream.lines
    .map((line) => JSON.parse(line) as RequestRecord)
    .filter((record) => record.req);
}

describe("logger", () => {
  it("defaults to info level when LOG_LEVEL is unset or blank", () => {
    expect(buildLogger().level).toBe("info");
    expect(buildLogger("").level).toBe("info");
    expect(buildLogger("   ").level).toBe("info");
  });

  it("respects LOG_LEVEL env", () => {
    expect(buildLogger("debug").level).toBe("debug");
    expect(buildLogger("warn").level).toBe("warn");
    expect(logger.level).toBe("silent");
  });

  it("moduleLogger binds the module name", () => {
    const child = moduleLogger("pollLifecycleService");
    expect(child.bindings()).toEqual({ module: "pollLifecycleService" });
  });
});

describe("pino-http middleware options", () => {
  function captureApp() {
    const stream = new CaptureStream();
    const captureLogger = pino({ level: "debug" }, stream);
    const app: Express = express();
    app.use(pinoHttp({ logger: captureLogger, ...pinoHttpOptions }));
    return { app, stream };
  }

  it("redacts authorization and set-cookie headers", async () => {
    const { app, stream } = captureApp();
    app.use((_req, res) => {
      res.setHeader("set-cookie", "session=secret-cookie-value");
      res.status(404).json({ message: "not found" });
    });

    await request(app).get("/").set("Authorization", "Bearer super-secret-token");

    const [record] = requestRecords(stream);
    expect(record).toBeDefined();
    expect(record.req.headers.authorization).toBe("[REDACTED]");
    expect(record.res.headers["set-cookie"]).toBe("[REDACTED]");
  });

  it("logs 2xx at debug, 4xx at warn, 5xx at error", async () => {
    const { app, stream } = captureApp();
    app.use((req, res) => {
      res.status(Number(req.query.status)).end();
    });

    for (const status of [200, 404, 500]) {
      await request(app).get("/").query({ status });
    }

    const byStatus = new Map(
      requestRecords(stream).map((record) => [record.res.statusCode, record.level]),
    );
    expect(byStatus.get(200)).toBe(20);
    expect(byStatus.get(404)).toBe(40);
    expect(byStatus.get(500)).toBe(50);
  });
});
