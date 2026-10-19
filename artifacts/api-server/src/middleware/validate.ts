import type { RequestHandler } from "express";
import { z } from "zod";

type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };
type Out<S, K extends keyof Schemas> = S extends { [P in K]: z.ZodType } ? z.output<S[K]> : unknown;

/**
 * Validates and replaces req.params / req.query / req.body with the parsed values, so handlers
 * after it get typed, coerced input. Responds 400 { error: { fieldErrors, formErrors } } otherwise.
 *
 *   router.get("/:id", validate({ params: GetExampleParams }), (req, res) => req.params.id)
 */
export function validate<S extends Schemas>(
  schemas: S
): RequestHandler<Out<S, "params">, unknown, Out<S, "body">, Out<S, "query">> {
  return (req, res, next) => {
    const fieldErrors: Record<string, string[]> = {};
    const formErrors: string[] = [];
    const parsed: Partial<Record<keyof Schemas, unknown>> = {};

    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
        continue;
      }
      const flat = z.flattenError(result.error);
      formErrors.push(...flat.formErrors);
      for (const [field, errors] of Object.entries(flat.fieldErrors)) {
        fieldErrors[field] = [...(fieldErrors[field] ?? []), ...((errors as string[]) ?? [])];
      }
    }

    if (formErrors.length > 0 || Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: { fieldErrors, formErrors } });
      return;
    }
    if ("params" in parsed) req.params = parsed.params as typeof req.params;
    if ("body" in parsed) req.body = parsed.body as typeof req.body;
    // Express 5 exposes req.query through a getter, so it can't be assigned.
    if ("query" in parsed) Object.defineProperty(req, "query", { value: parsed.query });
    next();
  };
}
