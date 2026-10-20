// The post-deploy check (docs/TESTING.md): reads each live site's JavaScript and checks how it was
// built. No test can see this: Vite bakes the VITE_* variables into the bundle at build time, from
// the hosting provider's settings, so a wrong or missing value passes CI and ships.

export type Environment = "production" | "staging";

export interface DeployTarget {
  /** The API origin the sites must call, e.g. "https://api.example.com". */
  api: string;
  /** Which Clerk instance the sites must sign in through: development ("test") or production ("live"). */
  clerkKey: "test" | "live";
  /** Each site's public URL, by name ("web", "admin"). */
  sites: Record<string, string>;
}

/**
 * Fetches a URL's status, body and response headers (names lowercased), sending `headers` (the
 * protection bypass header, if any).
 */
export type FetchText = (
  url: string,
  headers: Record<string, string>
) => Promise<{ status: number; text: string; headers: Record<string, string> }>;

export type SiteResult = { site: string; url: string } & (
  | { problems: string[] }
  | { skipped: string }
);

// Credentials that must never reach a browser, by kind. Matches are reported by kind only.
const SECRETS: [kind: string, pattern: RegExp][] = [
  ["a Clerk or Stripe secret key (sk_/rk_)", /\b[sr]k_(?:test|live)_[A-Za-z0-9]{16,}/],
  ["a webhook signing secret (whsec_)", /\bwhsec_[A-Za-z0-9+/=]{16,}/],
  ["an Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["an OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ["a database URL with a password", /\bpostgres(?:ql)?:\/\/[^\s"'`:@/]+:[^\s"'`@/]+@/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/** Why the targets table can't be used in `repo` (it describes another repo's sites), or null. */
export function foreignTargets(repo: string | undefined, targetsRepo: string): string | null {
  if (!repo || repo === targetsRepo) return null;
  return (
    `lib/ci/src/deploy-targets.ts describes ${targetsRepo}'s sites, not ${repo}'s: ` +
    "fill it in with this project's (/provision-vercel) and set DEPLOY_REPO"
  );
}

/** The page's own scripts (same origin), as absolute URLs. */
export function scriptUrls(html: string, pageUrl: string): string[] {
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => String(m[1]));
  const preloads = [
    ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
  ].map((m) => String(m[1]));
  return sameOrigin([...srcs, ...preloads], pageUrl);
}

/** The chunks a script loads on demand (Vite writes them as "assets/<name>.js"). */
export function chunkUrls(js: string, pageUrl: string): string[] {
  const paths = [...js.matchAll(/["'`(/]((?:\.\/)?assets\/[\w.-]+\.js)["'`)]/g)].map(
    (m) => `/${String(m[1]).replace(/^\.\//, "")}`
  );
  return sameOrigin(paths, pageUrl);
}

function sameOrigin(paths: string[], pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const urls = paths.map((p) => new URL(p, pageUrl)).filter((u) => u.origin === origin);
  return [...new Set(urls.map((u) => u.href))];
}

/**
 * The Clerk instance a publishable key belongs to: its type and frontend API host (public data).
 * Null for strings that look like a key but aren't one (Clerk's own code mentions the prefixes).
 */
export function clerkInstance(key: string): { type: "test" | "live"; host: string } | null {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key);
  if (!match) return null;
  const decoded = Buffer.from(String(match[2]), "base64").toString("utf8");
  if (!/^[a-z0-9.-]+\$$/.test(decoded)) return null;
  return { type: match[1] as "test" | "live", host: decoded.slice(0, -1) };
}

/**
 * What's wrong with the page's security headers (vercel.json) and its Content-Security-Policy
 * (the <meta> tag lib/csp adds at build time).
 */
export function checkPage(
  html: string,
  headers: Record<string, string>,
  target: DeployTarget
): string[] {
  const problems: string[] = [];
  const frameAncestors = /frame-ancestors 'none'/.test(headers["content-security-policy"] ?? "");
  if (headers["x-frame-options"] !== "DENY" && !frameAncestors) {
    problems.push("can be framed by other sites (no X-Frame-Options: DENY)");
  }
  if (headers["x-content-type-options"] !== "nosniff") {
    problems.push("lacks X-Content-Type-Options: nosniff");
  }
  if (!headers["strict-transport-security"]) problems.push("lacks Strict-Transport-Security");

  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  if (!meta) {
    problems.push("has no Content-Security-Policy <meta> tag (the csp() Vite plugin)");
  } else {
    const policy = String(meta[1]).replaceAll("&#39;", "'");
    const connect = (/(?:^|;\s*)connect-src ([^;]*)/.exec(policy)?.[1] ?? "").split(" ");
    if (!connect.includes(target.api)) {
      problems.push(`has a Content-Security-Policy that blocks calls to ${target.api}`);
    }
  }
  return problems;
}

/** What's wrong with a site's built JavaScript for `target`; `otherApis` are other environments'. */
export function checkBundle(js: string, target: DeployTarget, otherApis: string[]): string[] {
  const problems: string[] = [];

  if (!js.includes(target.api)) {
    const insecure = target.api.replace(/^https:/, "http:");
    problems.push(
      js.includes(insecure)
        ? `calls ${insecure} instead of ${target.api}`
        : `doesn't call ${target.api} (VITE_API_URL missing or wrong)`
    );
  }
  for (const other of otherApis) {
    if (other !== target.api && js.includes(other))
      problems.push(`calls another environment's API, ${other}`);
  }

  const keys = [...new Set(js.match(/\bpk_(?:test|live)_[A-Za-z0-9+/=_-]+/g) ?? [])]
    .map(clerkInstance)
    .filter((k) => k !== null);
  if (keys.length === 0) problems.push("has no Clerk publishable key (VITE_CLERK_PUBLISHABLE_KEY)");
  for (const key of keys) {
    if (key.type !== target.clerkKey) {
      problems.push(
        `signs in through a pk_${key.type} Clerk instance (${key.host}), expected pk_${target.clerkKey}`
      );
    }
  }

  for (const [kind, pattern] of SECRETS) {
    if (pattern.test(js)) problems.push(`ships ${kind}`);
  }
  return problems;
}

/** Fetches a site's page and every script it loads, and checks them against `target`. */
export async function checkSite(
  site: string,
  url: string,
  target: DeployTarget,
  otherApis: string[],
  fetchText: FetchText,
  bypass?: string
): Promise<SiteResult> {
  const headers: Record<string, string> = bypass ? { "x-vercel-protection-bypass": bypass } : {};
  const page = await fetchText(url, headers);
  if ((page.status === 401 || page.status === 403) && !bypass) {
    return {
      site,
      url,
      skipped: `protected (${page.status}); set its Vercel protection bypass secret`,
    };
  }
  if (page.status !== 200) return { site, url, problems: [`answers ${page.status}`] };
  const pageProblems = checkPage(page.text, page.headers, target);

  const queue = scriptUrls(page.text, url);
  if (queue.length === 0) return { site, url, problems: [...pageProblems, "loads no scripts"] };
  const seen = new Set<string>();
  let js = "";
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    const script = await fetchText(next, headers);
    if (script.status !== 200) {
      return { site, url, problems: [...pageProblems, `${next} answers ${script.status}`] };
    }
    js += `${script.text}\n`;
    queue.push(...chunkUrls(script.text, url));
  }
  return { site, url, problems: [...pageProblems, ...checkBundle(js, target, otherApis)] };
}
