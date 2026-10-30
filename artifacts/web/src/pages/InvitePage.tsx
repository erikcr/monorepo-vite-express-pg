import { RedirectToSignIn, Show } from "@clerk/react";
import { getGetMeQueryKey, useAcceptInvitation, useGetMe } from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Button, Page, PageTitle } from "../components/ui.tsx";

// An invitation email links to /invite#<token>. The token is in the fragment, which browsers
// never send to a server: it stays out of request logs and Referer headers.
export function InvitePage() {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <AcceptInvitation />
    </Show>
  );
}

function AcceptInvitation() {
  const token = useLocation({ select: (l) => l.hash });
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accept = useAcceptInvitation({
    mutation: {
      onSuccess: async (org) => {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        await navigate({ to: "/o/$org", params: { org: org.handle } });
      },
    },
  });

  return (
    <Page>
      <PageTitle>Join an organization</PageTitle>
      {token ? (
        <>
          <Button disabled={accept.isPending} onClick={() => accept.mutate({ data: { token } })}>
            Accept invitation
          </Button>
          {accept.error && <p className="text-destructive text-sm mt-3">{accept.error.message}</p>}
        </>
      ) : (
        <p className="text-sm">
          This invitation link is incomplete. Open it again from the email, all of it.
        </p>
      )}
      {me && <p className="text-text-muted text-sm mt-4">Signed in as {me.user.email}</p>}
    </Page>
  );
}
