// Shown instead of the app when the build has no Clerk publishable key.
export function MissingClerkKey() {
  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Sign-in isn't configured</h1>
      <p className="text-text-muted text-sm">
        Set <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> (your Clerk instance's
        publishable key) in the repo-root <code className="font-mono">.env</code>, or in the Vercel
        project's environment, and rebuild.
      </p>
    </main>
  );
}
