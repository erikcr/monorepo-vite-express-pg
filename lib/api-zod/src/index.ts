import { z } from "zod";

// Generated from lib/api-spec/openapi.yaml — do not edit by hand.
// Re-generate with: pnpm codegen

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  ts: z.string().datetime(),
  db: z.enum(["ok", "error"]),
});

export const ExampleSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateExampleInputSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type Example = z.infer<typeof ExampleSchema>;
export type CreateExampleInput = z.infer<typeof CreateExampleInputSchema>;
