/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for production builds (Vercel); unset in dev, where Vite proxies to the API. */
  readonly VITE_API_URL?: string;
  /** Clerk publishable key (pk_test_… / pk_live_…). Required: the app can't sign anyone in without it. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
