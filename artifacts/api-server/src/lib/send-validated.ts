import type { Response } from "express";
import type { z } from "zod";

/**
 * Sends `data` as JSON after parsing it with the endpoint's response schema (from @repo/api-zod).
 * Fields the spec doesn't declare are stripped, so returning a full database row can't leak a
 * server-only column; a response that doesn't match the spec throws (→ 500) instead of shipping.
 */
export function sendValidated<S extends z.ZodType>(
  res: Response,
  schema: S,
  data: z.input<S> | Record<string, unknown> | unknown[],
  status = 200
): void {
  // Serialize first (Dates → ISO strings) so the schema checks exactly what the client will see.
  const json: unknown = JSON.parse(JSON.stringify(data));
  res.status(status).json(schema.parse(json));
}
