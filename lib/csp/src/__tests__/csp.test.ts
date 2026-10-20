import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";
import { clerkHost, contentSecurityPolicy, csp } from "../index.js";

// A publishable key is "pk_<type>_" + base64("<frontend api host>$"); built at runtime so nothing
// committed looks like a real key.
const key = (host: string) => `pk_test_${Buffer.from(`${host}$`).toString("base64")}`;
const KEY = key("clean-mole-12.clerk.accounts.dev");

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((d) => {
      const [name, ...sources] = d.split(" ");
      return [name, sources];
    })
  );

describe("clerkHost", () => {
  it("decodes a publishable key's Frontend API host", () => {
    expect(clerkHost(KEY)).toBe("clean-mole-12.clerk.accounts.dev");
    expect(clerkHost(`pk_live_${Buffer.from("clerk.example.com$").toString("base64")}`)).toBe(
      "clerk.example.com"
    );
  });

  it("refuses anything else, rather than build a policy that locks Clerk out", () => {
    for (const bad of ["sk_test_abc", "pk_test_", "pk_test_bm90IGEgaG9zdA==", "pk_test_%%%"]) {
      expect(() => clerkHost(bad)).toThrow("isn't a Clerk publishable key");
    }
  });
});

describe("contentSecurityPolicy", () => {
  it("lets the site call its API and Clerk, and load scripts only from itself and Clerk", () => {
    const policy = directives(
      contentSecurityPolicy({ apiUrl: "https://api.example.com/", clerkPublishableKey: KEY })
    );
    const clerk = "https://clean-mole-12.clerk.accounts.dev";
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toEqual([
      "'self'",
      clerk,
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ]);
    expect(policy["connect-src"]).toEqual([
      "'self'",
      "https://api.example.com",
      clerk,
      "https://*.protect.clerk.com:*",
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
    ]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    // No inline or eval'd scripts, ever.
    expect(policy["script-src"]).not.toContain("'unsafe-inline'");
    expect(JSON.stringify(policy)).not.toContain("unsafe-eval");
  });

  it("leaves out what isn't configured: an API on the site's own origin, a missing key", () => {
    const policy = directives(contentSecurityPolicy({}));
    expect(policy["connect-src"]).toEqual([
      "'self'",
      "https://*.protect.clerk.com:*",
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
    ]);
    expect(policy["script-src"]).toEqual([
      "'self'",
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ]);
  });
});

describe("csp() plugin", () => {
  const buildSite = async (env: string, mode?: string) => {
    const root = mkdtempSync(join(tmpdir(), "csp-"));
    writeFileSync(
      join(root, "index.html"),
      "<html><head><title>x</title></head><body></body></html>"
    );
    writeFileSync(join(root, ".env"), env);
    const output = (await build({
      root,
      mode,
      logLevel: "silent",
      plugins: [csp()],
      build: { write: false },
    })) as Rolldown.RolldownOutput;
    const html = output.output.find((f) => f.fileName === "index.html");
    return html && "source" in html ? String(html.source) : "";
  };

  it("puts the policy for the build's own variables first in <head>", async () => {
    const html = await buildSite(
      `VITE_API_URL=https://api.example.com\nVITE_CLERK_PUBLISHABLE_KEY=${KEY}\n`
    );
    const policy = contentSecurityPolicy({
      apiUrl: "https://api.example.com",
      clerkPublishableKey: KEY,
    });
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    // Before anything else in <head>, so it applies to everything the page loads.
    expect(html.replaceAll("&#39;", "'")).toMatch(/^<html><head>\s*<meta /);
    expect(html.replaceAll("&#39;", "'")).toContain(meta);
  });

  it("fails the build on a malformed Clerk key", async () => {
    await expect(buildSite("VITE_CLERK_PUBLISHABLE_KEY=pk_test_nope\n")).rejects.toThrow(
      "isn't a Clerk publishable key"
    );
  });
});
