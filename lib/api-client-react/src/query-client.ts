import { QueryCache, QueryClient, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef } from "react";
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

/**
 * Forgets every cached response when the signed-in person changes: sign-out, sign-in, or one
 * session replacing another. Sign-out doesn't reload the page, so without this the next person
 * on the same tab is shown the previous one's data. `userId` is null signed out and undefined
 * while the session loads. Queries still on screen refetch for the new person.
 */
export function useForgetOnUserChange(userId: string | null | undefined): void {
  const queryClient = useQueryClient();
  const previous = useRef(userId);
  // A layout effect, so nothing cached is painted for the new person.
  useLayoutEffect(() => {
    if (userId === undefined || userId === previous.current) return;
    const changed = previous.current !== undefined;
    previous.current = userId;
    if (!changed) return;
    queryClient.getMutationCache().clear();
    void queryClient.resetQueries();
  }, [userId, queryClient]);
}
