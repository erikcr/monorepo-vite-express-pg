import type { CreateExampleInput, Example, HealthResponse } from "@repo/api-zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client.js";

export { apiFetch };

// ── Example ──────────────────────────────────────────────────────────────────

export function useExamples(orgId?: string) {
  const params = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  return useQuery<Example[]>({
    queryKey: ["examples", orgId],
    queryFn: () => apiFetch(`/api/example${params}`),
  });
}

export function useCreateExample() {
  const qc = useQueryClient();
  return useMutation<Example, Error, CreateExampleInput>({
    mutationFn: (input) =>
      apiFetch("/api/example", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["examples"] }),
  });
}

// ── Health ────────────────────────────────────────────────────────────────────

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => apiFetch("/health"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
