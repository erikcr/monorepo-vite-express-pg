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
}: {
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{children}</h1>
      {description && <p className="text-text-muted text-sm mt-1">{description}</p>}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface-raised border border-border rounded-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-4">
        {title}
      </h2>
      {children}
    </section>
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

const control = "bg-surface border border-border rounded-input px-3 py-2 text-sm";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${control} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${control} ${className}`} />;
}

/** A form control with its label above it. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as `children`
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}
