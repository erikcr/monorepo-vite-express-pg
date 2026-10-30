import type { ComponentProps, ReactNode } from "react";

// The app's building blocks: plain elements styled only with the theme's tokens (src/index.css),
// so a new project restyles them here and in the tokens, rather than page by page.

/** A page's content: centered, the same width as the header, under it. */
export function Page({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <main className={`flex-1 w-full max-w-content mx-auto px-page-x py-page-y ${className}`}>
      {children}
    </main>
  );
}

export function PageTitle({
  children,
  description,
  aside,
}: {
  children: ReactNode;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold">{children}</h1>
        {description && <p className="text-text-muted text-sm mt-1">{description}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Stands in for content still on its way. Inside `Page`, it sits where the content will. */
export function Loading() {
  return (
    <p role="status" className="text-text-muted text-sm">
      Loading…
    </p>
  );
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={`bg-brand text-brand-fg rounded-button px-4 py-2 text-sm disabled:opacity-50 ${className}`}
    />
  );
}
