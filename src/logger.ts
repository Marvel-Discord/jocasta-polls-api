import pino from "pino";
import type { Options } from "pino-http";

export function buildLogger(level?: string) {
  return pino({
    level: level?.trim() || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
  });
}

export const logger = buildLogger(process.env.LOG_LEVEL);

export function moduleLogger(name: string) {
  return logger.child({ module: name });
}

export const pinoHttpOptions: Omit<Options, "logger"> = {
  redact: {
    paths: ["req.headers.authorization", "res.headers.set-cookie"],
    censor: "[REDACTED]",
  },
  customLogLevel: (_req, res, err) =>
    err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "debug",
};
