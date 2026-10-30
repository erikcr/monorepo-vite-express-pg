import {
  getGetMeQueryKey,
  type HandleAvailabilityReason,
  type OrgMembership,
  useCheckOrgHandle,
  useCreateOrg,
} from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Button, Field, Input } from "../components/ui.tsx";

/** The handle a name suggests: "Acme, Inc." gives "acme-inc". The API has the final say. */
const suggestHandle = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

const UNAVAILABLE: Record<HandleAvailabilityReason, string> = {
  taken: "That handle is taken",
  reserved: "That handle is reserved",
  invalid: "Use 3–40 lowercase letters, digits and single hyphens, with no hyphen at either end",
};

/** `value`, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * A new org's name and handle (its address, /o/<handle>). The handle follows the name until the
 * person edits it, and is checked as they type.
 */
export function CreateOrgForm({ onCreated }: { onCreated: (org: OrgMembership) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editedHandle, setEditedHandle] = useState<string | null>(null);
  const handle = editedHandle ?? suggestHandle(name);
  const settled = useSettled(handle);
  const check = useCheckOrgHandle(
    { handle: settled },
    { query: { enabled: settled !== "", staleTime: 30_000 } }
  );
  const createOrg = useCreateOrg({
    mutation: {
      onSuccess: async (org) => {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        onCreated(org);
      },
    },
  });

  const checking = handle !== settled || check.isFetching;
  const answer = checking ? undefined : check.data;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    createOrg.mutate({ data: { name, handle } });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </Field>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="org-handle">Handle</label>
        <span className="flex items-center gap-1">
          <span className="text-text-muted">/o/</span>
          <Input
            id="org-handle"
            className="flex-1"
            value={handle}
            onChange={(e) => setEditedHandle(e.target.value.toLowerCase())}
            required
            maxLength={40}
            aria-describedby="handle-status"
            autoCapitalize="none"
            spellCheck={false}
          />
        </span>
      </div>
      <p id="handle-status" aria-live="polite" className="text-sm min-h-5">
        {handle === "" ? null : checking ? (
          <span className="text-text-muted">Checking…</span>
        ) : check.error ? (
          <span className="text-text-muted">Couldn't check this handle; you can still try it.</span>
        ) : answer?.available ? (
          <span className="text-text-muted">Available</span>
        ) : answer?.reason ? (
          <span className="text-destructive">{UNAVAILABLE[answer.reason]}</span>
        ) : null}
      </p>
      {createOrg.error && <p className="text-destructive text-sm">{createOrg.error.message}</p>}
      <Button
        type="submit"
        className="self-start"
        disabled={createOrg.isPending || answer?.available === false}
      >
        Create
      </Button>
    </form>
  );
}
