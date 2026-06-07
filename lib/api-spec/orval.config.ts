import { defineConfig } from "orval";

export default defineConfig({
  // Generates React Query hooks → lib/api-client-react/src/index.ts
  "api-client-react": {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "../../lib/api-client-react/src/index.ts",
      client: "react-query",
      override: {
        mutator: {
          path: "../../lib/api-client-react/src/client.ts",
          name: "apiFetch",
        },
        query: {
          useQuery: true,
          useMutation: true,
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
      client: "zod",
    },
  },
});
