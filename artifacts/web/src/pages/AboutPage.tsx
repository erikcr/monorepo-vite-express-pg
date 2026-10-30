import { Page, PageTitle } from "../components/ui.tsx";

// Placeholder second route: replace with your app's pages.
export function AboutPage() {
  return (
    <Page>
      <PageTitle>About</PageTitle>
      <p className="text-text-muted text-sm">
        A placeholder page. Add routes in <code className="font-mono">src/router.tsx</code>.
      </p>
    </Page>
  );
}
