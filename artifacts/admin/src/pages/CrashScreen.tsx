import { Button, Page, PageTitle } from "../components/ui.tsx";

// Shown instead of a blank page when rendering fails. The error has already been reported.
export function CrashScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <Page>
      <PageTitle description="The error has been reported. Try again, or reload the page.">
        Something went wrong
      </PageTitle>
      <Button onClick={onRetry ?? (() => window.location.reload())}>
        {onRetry ? "Try again" : "Reload"}
      </Button>
    </Page>
  );
}
