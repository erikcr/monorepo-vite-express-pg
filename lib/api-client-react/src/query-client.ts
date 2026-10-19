import { QueryCache, QueryClient } from "@tanstack/react-query";

/** The QueryClient both apps use: explicit defaults instead of TanStack's surprises. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1, // one retry for flaky networks; a real error shows quickly
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
