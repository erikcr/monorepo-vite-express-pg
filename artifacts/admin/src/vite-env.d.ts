/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for production builds (Vercel); unset in dev, where Vite proxies to the API. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
