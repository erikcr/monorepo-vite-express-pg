import type { Plugin } from "vite";

// The sites' Content-Security-Policy, built from the same variables as the site itself: the API
// it calls (VITE_API_URL) and the Clerk instance it signs in through (VITE_CLERK_PUBLISHABLE_KEY).
// Clerk's requirements: https://clerk.com/docs/guides/secure/best-practices/csp-headers
// The policy goes into index.html as a <meta> tag at build time; the headers that a <meta> tag
// can't carry (frame-ancestors, …) are in each app's vercel.json.

export interface PolicyInput {
  /** The API origin, or undefined when the site calls its own origin (dev, E2E). */
  apiUrl?: string;
  clerkPublishableKey?: string;
}

/** The Clerk Frontend API host a publishable key belongs to (the key is base64 of "<host>$"). */
export function clerkHost(publishableKey: string): string {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey);
  const decoded = match ? Buffer.from(String(match[1]), "base64").toString("utf8") : "";
  if (!/^[a-z0-9.-]+\$$/.test(decoded)) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY isn't a Clerk publishable key (pk_test_/pk_live_…)"
    );
  }
  return decoded.slice(0, -1);
}

export function contentSecurityPolicy({ apiUrl, clerkPublishableKey }: PolicyInput): string {
  const api = apiUrl ? [new URL(apiUrl).origin] : [];
  const clerk = clerkPublishableKey ? [`https://${clerkHost(clerkPublishableKey)}`] : [];
  // Bot protection on sign-up (Cloudflare Turnstile) and Clerk's fraud checks.
  const challenges = ["https://challenges.cloudflare.com", "https://*.protect.clerk.com"];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...clerk, ...challenges],
    "connect-src": [
      "'self'",
      ...api,
      ...clerk,
      "https://*.protect.clerk.com:*",
      // Clerk development instances send telemetry.
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
    ],
    "img-src": ["'self'", "data:", "https://img.clerk.com"],
    // Clerk styles its components at runtime.
    "style-src": ["'self'", "'unsafe-inline'"],
    "frame-src": challenges,
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * Vite plugin: adds the policy to index.html in production builds. The dev server has none (its
 * hot reloading uses inline scripts); the E2E suite runs the built sites, so it's tested there.
 */
export function csp(): Plugin {
  let policy = "";
  return {
    name: "repo:csp",
    apply: "build",
    configResolved(config) {
      policy = contentSecurityPolicy({
        apiUrl: config.env.VITE_API_URL,
        clerkPublishableKey: config.env.VITE_CLERK_PUBLISHABLE_KEY,
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
