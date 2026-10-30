import { Link } from "@tanstack/react-router";
import { Page, PageTitle } from "../components/ui.tsx";

export function NotFoundPage() {
  return (
    <Page>
      <PageTitle description="There's nothing at this address.">Page not found</PageTitle>
      <Link to="/" className="text-brand text-sm underline">
        Back to home
      </Link>
    </Page>
  );
}
