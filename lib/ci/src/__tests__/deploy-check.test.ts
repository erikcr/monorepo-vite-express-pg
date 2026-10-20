import { describe, expect, it } from "vitest";
import {
  checkBundle,
  checkPage,
  checkSite,
  chunkUrls,
  clerkInstance,
  type DeployTarget,
  type FetchText,
  scriptUrls,
} from "../deploy-check.ts";

// Fake credentials are assembled at runtime so nothing committed looks like a real one.
const publishableKey = (type: "test" | "live", host: string) =>
  `pk_${type}_${Buffer.from(`${host}$`).toString("base64")}`;
const TEST_KEY = publishableKey("test", "clean-mole-12.clerk.accounts.dev");
const LIVE_KEY = publishableKey("live", "clerk.example.com");
const fake = (prefix: string, length = 32) => `${prefix}${"x".repeat(length)}`;

const PROD: DeployTarget = {
  api: "https://api.example.com",
  clerkKey: "live",
  sites: { web: "https://example.com" },
};
const STAGING_API = "https://api.staging.example.com";
const APIS = [PROD.api, STAGING_API];

// How Vite inlines the two variables into a build.
const build = (apiUrl: string | undefined, clerkKey: string | undefined) =>
  `const a={VITE_API_URL:${JSON.stringify(apiUrl)},VITE_CLERK_PUBLISHABLE_KEY:${JSON.stringify(clerkKey)}};` +
  `function f(k){if(!k.startsWith("pk_live_")&&!k.startsWith("pk_test_"))throw Error("bad key")}`;

describe("checkBundle", () => {
  it("passes a build with the environment's API, its Clerk key type and no secrets", () => {
    expect(checkBundle(build(PROD.api, LIVE_KEY), PROD, APIS)).toEqual([]);
  });

  it("catches a missing API address", () => {
    expect(checkBundle(build(undefined, LIVE_KEY), PROD, APIS)).toEqual([
      "doesn't call https://api.example.com (VITE_API_URL missing or wrong)",
    ]);
  });

  it("catches the API address without https", () => {
    expect(checkBundle(build("http://api.example.com", LIVE_KEY), PROD, APIS)).toEqual([
      "calls http://api.example.com instead of https://api.example.com",
    ]);
  });

  it("catches a build against another environment's API", () => {
    expect(checkBundle(build(STAGING_API, LIVE_KEY), PROD, APIS)).toEqual([
      "doesn't call https://api.example.com (VITE_API_URL missing or wrong)",
      "calls another environment's API, https://api.staging.example.com",
    ]);
  });

  it("catches the wrong Clerk instance, naming its host", () => {
    expect(checkBundle(build(PROD.api, TEST_KEY), PROD, APIS)).toEqual([
      "signs in through a pk_test Clerk instance (clean-mole-12.clerk.accounts.dev), expected pk_live",
    ]);
  });

  it("catches a Clerk secret key put in the publishable key's variable, without printing it", () => {
    const secret = fake("sk_live_");
    const problems = checkBundle(build(PROD.api, secret), PROD, APIS);
    expect(problems).toEqual([
      "has no Clerk publishable key (VITE_CLERK_PUBLISHABLE_KEY)",
      "ships a Clerk or Stripe secret key (sk_/rk_)",
    ]);
    expect(problems.join(" ")).not.toContain(secret);
  });

  it.each([
    ["a Clerk or Stripe secret key (sk_/rk_)", fake("rk_test_", 24)],
    ["a webhook signing secret (whsec_)", fake("whsec_", 24)],
    ["an Anthropic API key", fake("sk-ant-api03-", 40)],
    ["an OpenAI API key", fake("sk-proj-", 48)],
    ["a database URL with a password", "postgres://app:hunter2@db.internal:5432/app"],
    ["a private key", "-----BEGIN RSA PRIVATE KEY-----"],
  ])("catches %s", (kind, secret) => {
    expect(checkBundle(`${build(PROD.api, LIVE_KEY)}const s="${secret}";`, PROD, APIS)).toEqual([
      `ships ${kind}`,
    ]);
  });
});

// A page as Vercel serves it: vercel.json's headers, and lib/csp's <meta> tag (quotes escaped, as
// Vite writes them).
const SECURE_HEADERS = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};
const page = (body: string, connectSrc = `'self' ${PROD.api}`) =>
  `<html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; connect-src ${connectSrc.replaceAll("'", "&#39;")}; object-src &#39;none&#39;">${body}</head></html>`;

describe("checkPage", () => {
  it("passes a page with the security headers and a policy that allows the API", () => {
    expect(checkPage(page(""), SECURE_HEADERS, PROD)).toEqual([]);
  });

  it("accepts frame-ancestors 'none' alone against framing", () => {
    const { "x-frame-options": _, ...headers } = SECURE_HEADERS;
    expect(checkPage(page(""), headers, PROD)).toEqual([]);
  });

  it("catches each missing header", () => {
    expect(checkPage(page(""), {}, PROD)).toEqual([
      "can be framed by other sites (no X-Frame-Options: DENY)",
      "lacks X-Content-Type-Options: nosniff",
      "lacks Strict-Transport-Security",
    ]);
  });

  it("catches a page without the policy, or with one that blocks the API", () => {
    expect(checkPage("<html></html>", SECURE_HEADERS, PROD)).toEqual([
      "has no Content-Security-Policy <meta> tag (the csp() Vite plugin)",
    ]);
    expect(checkPage(page("", `'self' ${STAGING_API}`), SECURE_HEADERS, PROD)).toEqual([
      "has a Content-Security-Policy that blocks calls to https://api.example.com",
    ]);
    // The API named in another directive doesn't count.
    const elsewhere = `<meta http-equiv="Content-Security-Policy" content="img-src ${PROD.api}; connect-src &#39;self&#39;">`;
    expect(checkPage(elsewhere, SECURE_HEADERS, PROD)).toEqual([
      "has a Content-Security-Policy that blocks calls to https://api.example.com",
    ]);
    // Without connect-src, default-src 'self' applies.
    const noConnect = `<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;">`;
    expect(checkPage(noConnect, SECURE_HEADERS, PROD)).toEqual([
      "has a Content-Security-Policy that blocks calls to https://api.example.com",
    ]);
  });
});

describe("clerkInstance", () => {
  it("decodes a publishable key's type and host", () => {
    expect(clerkInstance(TEST_KEY)).toEqual({
      type: "test",
      host: "clean-mole-12.clerk.accounts.dev",
    });
  });

  it("rejects strings that only look like keys", () => {
    expect(clerkInstance("pk_live_")).toBeNull();
    expect(clerkInstance("pk_test_notbase64ofahost")).toBeNull();
  });
});

describe("scriptUrls and chunkUrls", () => {
  it("lists the page's own scripts and preloads, not other origins'", () => {
    const html = `<script type="module" crossorigin src="/assets/index-abc.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-def.js">
      <script src="https://cdn.example.net/x.js"></script>`;
    expect(scriptUrls(html, "https://example.com/")).toEqual([
      "https://example.com/assets/index-abc.js",
      "https://example.com/assets/vendor-def.js",
    ]);
  });

  it("finds the chunks a script imports on demand", () => {
    const js = `import("./assets/About-1a2b.js");const m=["assets/Admin-3c4d.js","assets/About-1a2b.js"]`;
    expect(chunkUrls(js, "https://example.com/")).toEqual([
      "https://example.com/assets/About-1a2b.js",
      "https://example.com/assets/Admin-3c4d.js",
    ]);
  });
});

describe("checkSite", () => {
  const serve =
    (files: Record<string, string>, status: Record<string, number> = {}): FetchText =>
    async (url) => ({
      status: status[url] ?? (url in files ? 200 : 404),
      text: files[url] ?? "",
      headers: SECURE_HEADERS,
    });

  it("checks every script the page loads, including on-demand chunks", async () => {
    const fetchText = serve({
      "https://example.com": page(`<script type="module" src="/assets/index.js"></script>`),
      "https://example.com/assets/index.js": `${build(PROD.api, LIVE_KEY)}import("./assets/Page.js")`,
      "https://example.com/assets/Page.js": `const leak="${fake("whsec_", 24)}"`,
    });
    expect(await checkSite("web", "https://example.com", PROD, APIS, fetchText)).toEqual({
      site: "web",
      url: "https://example.com",
      problems: ["ships a webhook signing secret (whsec_)"],
    });
  });

  it("fetches each script once, even when chunks import each other", async () => {
    const fetched: string[] = [];
    const files: Record<string, string> = {
      "https://example.com": page(`<script type="module" src="/assets/index.js"></script>`),
      "https://example.com/assets/index.js": `${build(PROD.api, LIVE_KEY)}import("./assets/a.js")`,
      "https://example.com/assets/a.js": `import("./assets/b.js")`,
      "https://example.com/assets/b.js": `import("./assets/a.js");import("./assets/index.js")`,
    };
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      if (fetched.length > 10) throw new Error(`fetching in a loop: ${fetched.join(", ")}`);
      return { status: 200, text: files[url] ?? "", headers: SECURE_HEADERS };
    };
    expect(await checkSite("web", "https://example.com", PROD, APIS, fetchText)).toMatchObject({
      problems: [],
    });
    expect(fetched).toEqual(Object.keys(files));
  });

  it("skips a protected site without a bypass secret, and sends the secret when it has one", async () => {
    const seen: Record<string, string>[] = [];
    const fetchText: FetchText = async (_url, headers) => {
      seen.push(headers);
      return { status: 401, text: "", headers: {} };
    };
    expect(await checkSite("web", "https://example.com", PROD, APIS, fetchText)).toMatchObject({
      skipped: "protected (401); set its Vercel protection bypass secret",
    });
    expect(
      await checkSite("web", "https://example.com", PROD, APIS, fetchText, "s3")
    ).toMatchObject({
      problems: ["answers 401"],
    });
    expect(seen).toEqual([{}, { "x-vercel-protection-bypass": "s3" }]);
  });

  it("reports the page's problems along with the scripts'", async () => {
    const fetchText: FetchText = async (url) => ({
      status: 200,
      text: url.endsWith(".js")
        ? build(PROD.api, TEST_KEY)
        : `<script src="/assets/index.js"></script>`,
      headers: SECURE_HEADERS,
    });
    expect(await checkSite("web", "https://example.com", PROD, APIS, fetchText)).toMatchObject({
      problems: [
        "has no Content-Security-Policy <meta> tag (the csp() Vite plugin)",
        "signs in through a pk_test Clerk instance (clean-mole-12.clerk.accounts.dev), expected pk_live",
      ],
    });
  });

  it("fails a page with no scripts, or a script that doesn't load", async () => {
    const noScripts = serve({ "https://example.com": page("<p>Maintenance</p>") });
    expect(await checkSite("web", "https://example.com", PROD, APIS, noScripts)).toMatchObject({
      problems: ["loads no scripts"],
    });
    const missing = serve({
      "https://example.com": page(`<script src="/assets/gone.js"></script>`),
    });
    expect(await checkSite("web", "https://example.com", PROD, APIS, missing)).toMatchObject({
      problems: ["https://example.com/assets/gone.js answers 404"],
    });
  });
});
