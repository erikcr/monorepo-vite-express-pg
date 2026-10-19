import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-text-muted text-sm mb-4">There's nothing at this address.</p>
      <Link to="/" className="text-brand text-sm underline">
        Back to home
      </Link>
    </main>
  );
}
