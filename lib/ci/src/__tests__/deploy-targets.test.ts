import { describe, expect, it } from "vitest";
import { DEPLOY_TARGETS } from "../deploy-targets.ts";

// A typo in the table would make every deploy check fail, or worse, pass against the wrong thing.
describe("DEPLOY_TARGETS", () => {
  const targets = Object.entries(DEPLOY_TARGETS);

  it("has production, with at least one site", () => {
    expect(DEPLOY_TARGETS.production?.sites).not.toEqual({});
  });

  it.each(targets)(
    "%s: every address is an https origin, with no path or trailing slash",
    (_, t) => {
      for (const url of [t.api, ...Object.values(t.sites)]) {
        expect(new URL(url).protocol, url).toBe("https:");
        expect(new URL(url).origin, url).toBe(url);
      }
    }
  );

  it("gives each environment its own API", () => {
    const apis = targets.map(([, t]) => t.api);
    expect(new Set(apis).size).toBe(apis.length);
  });
});
