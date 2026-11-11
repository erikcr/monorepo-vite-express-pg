import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { mountedRoutes } from "../test-helpers/mounted-routes.js";

// The spec is the contract the generated clients are built from, so the server must implement
// exactly what it declares: an operation without a route is a client call that 404s, and a route
// without an operation is an endpoint no client is generated for and no response is validated by.
const SPEC = resolve(import.meta.dirname, "../../../../lib/api-spec/openapi.yaml");
const METHODS = ["get", "post", "put", "patch", "delete"];
// Routes that serve the spec itself, and webhooks: their providers define the payloads and no
// client of ours calls them.
const NOT_IN_SPEC = new Set([
  "GET /docs",
  "GET /docs/openapi.yaml",
  "POST /api/webhooks/resend",
  "POST /api/webhooks/clerk",
]);

const readSpec = () => parse(readFileSync(SPEC, "utf8"));

function specOperations(): string[] {
  const spec = readSpec() as { paths: Record<string, object> };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map(
      (m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`
    )
  );
}

describe("API contract", () => {
  it("mounts a route for every spec operation, and nothing the spec doesn't declare", async () => {
    const mounted = (await mountedRoutes()).map((r) => r.key).filter((k) => !NOT_IN_SPEC.has(k));
    expect(mounted.sort()).toEqual(specOperations().sort());
  });
});

interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  maxLength?: number;
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: Schema | boolean;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
}
interface Parameter {
  $ref?: string;
  name: string;
  in: string;
  schema: Schema;
}
interface Operation {
  parameters?: Parameter[];
  requestBody?: { content: Record<string, { schema: Schema }> };
}

// Strings whose format already bounds them; enums are bounded by their values.
const FIXED_FORMATS = new Set(["uuid", "date-time", "date"]);

/** Every string a request can carry (bodies and parameters, refs followed), by path. */
function requestStrings(): { path: string; bounded: boolean }[] {
  const spec = readSpec();
  const deref = <T extends { $ref?: string }>(node: T): T =>
    node.$ref
      ? deref(
          node.$ref
            .slice(2)
            .split("/")
            .reduce((at, key) => at[key], spec) as T
        )
      : node;
  const found: { path: string; bounded: boolean }[] = [];
  const walk = (node: Schema, path: string) => {
    const s = deref(node);
    for (const sub of [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])]) walk(sub, path);
    for (const [key, prop] of Object.entries(s.properties ?? {})) walk(prop, `${path}.${key}`);
    if (s.items) walk(s.items, `${path}[]`);
    if (typeof s.additionalProperties === "object") walk(s.additionalProperties, `${path}.*`);
    if ([s.type].flat().includes("string")) {
      const shaped = s.enum !== undefined || FIXED_FORMATS.has(s.format ?? "");
      found.push({ path, bounded: shaped || s.maxLength !== undefined });
    }
  };
  type PathItem = Record<string, Operation> & { parameters?: Parameter[] };
  for (const [route, item] of Object.entries(spec.paths as Record<string, PathItem>)) {
    for (const method of METHODS.filter((m) => m in item)) {
      const op = item[method] as Operation;
      const at = `${method.toUpperCase()} ${route}`;
      for (const p of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        const param = deref(p);
        walk(param.schema, `${at} ${param.in}.${param.name}`);
      }
      for (const [type, media] of Object.entries(op.requestBody?.content ?? {})) {
        walk(media.schema, `${at} body(${type})`);
      }
    }
  }
  return found;
}

// A request string with no maximum length is as long as a client cares to send, and every one
// reaches a query, an email or a log. The body limit (100 kB) is no bound for one field.
describe("request limits", () => {
  const strings = requestStrings();

  it("walks every request body and parameter in the spec", () => {
    expect(strings.map((s) => s.path)).toEqual(
      expect.arrayContaining([
        "POST /api/example body(application/json).name",
        "GET /api/example query.cursor",
        "POST /api/client-errors body(application/json).stack",
      ])
    );
  });

  it("gives every string a request carries a maximum length", () => {
    expect(strings.filter((s) => !s.bounded).map((s) => s.path)).toEqual([]);
  });
});
