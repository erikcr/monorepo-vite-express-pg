import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client.js";

/** The QueryClient both apps use: explicit defaults instead of TanStack's surprises. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // One retry for flaky networks. The API's own answers (401, 403, 404…) won't change on a
        // second try, and retrying them keeps a page in its loading state for a second.
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status < 500),
        staleTime: 30_000, // reuse data for 30s instead of refetching on every mount
        refetchOnWindowFocus: false,
      },
    },
    queryCache: new QueryCache({
      // Failed queries show in their component; this makes every one visible in the console too.
      onError: (error, query) => console.error("query failed", query.queryKey, error),
    }),
  });
}
