import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { type Options, pinoHttp } from "pino-http";
import { logger } from "../logger.js";

const withoutQuery = (url: string | undefined) => (url ?? "").split(/[?#]/)[0];

// Accept an inbound x-request-id (e.g. from a proxy) only if it's short and plain; else mint one.
const INBOUND_ID = /^[\w.-]{1,128}$/;

/**
 * One log line per request, with a request id that's also returned as `x-request-id` and attached
 * as `req.id` / `req.log` for handlers. Query strings are dropped from logged URLs (they can carry
 * tokens or personal data) and auth headers are redacted. Health probes aren't logged.
 */
export const requestLogOptions = {
  genReqId(req, res) {
    const inbound = req.headers["x-request-id"];
    const id = typeof inbound === "string" && INBOUND_ID.test(inbound) ? inbound : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  autoLogging: { ignore: (req) => (req.url ?? "").startsWith("/health") },
  customLogLevel: (_req, res, err) =>
    err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
  serializers: {
    req(req: IncomingMessage & { id?: string }) {
      const { referer, ...headers } = req.headers;
      return {
        id: req.id,
        method: req.method,
        url: withoutQuery(req.url),
        // Browsers send the page's full URL as Referer, query string included.
        headers: referer ? { ...headers, referer: withoutQuery(referer) } : headers,
      };
    },
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
    censor: "[redacted]",
  },
} satisfies Options;

export const requestLogger = pinoHttp({ logger, ...requestLogOptions });
