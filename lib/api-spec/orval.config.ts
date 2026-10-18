import { defineConfig } from "orval";

export default defineConfig({
  // Generates React Query hooks → lib/api-client-react/src/index.ts
  "api-client-react": {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "../../lib/api-client-react/src/index.ts",
      // Orval reads the react-query version from here to pick v5 hook types.
      packageJson: "../../lib/api-client-react/package.json",
      client: "react-query",
      override: {
        mutator: {
          path: "../../lib/api-client-react/src/client.ts",
          name: "apiFetch",
        },
        // Hooks return the response body, not { data, status, headers }.
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
  // Generates Zod validation schemas → lib/api-zod/src/index.ts
  "api-zod": {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "../../lib/api-zod/src/index.ts",
      // Orval reads the zod version from here to pick Zod 4 syntax.
      packageJson: "../../lib/api-zod/package.json",
      client: "zod",
    },
  },
});
