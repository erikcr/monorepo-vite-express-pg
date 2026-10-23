import { type ReactNode, useId } from "react";

/**
 * A section of the settings dialog: every section opens with the same header (its title and one
 * line of description), so its content always starts in the same place.
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <header className="sticky top-0 z-10 px-6 py-4 bg-surface-raised border-b border-border">
        <h3 id={titleId} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-text-muted mt-0.5">{description}</p>
      </header>
      {/* A container, so content sizes to the section (@md:, @lg:), not the window behind the
          dialog: md: and lg: still mean the window's width. */}
      <div className="@container px-6 py-5 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/**
 * What an explicit action just did ("Invitation sent to …"), next to the control that did it.
 * Always rendered, so screen readers announce the text when it appears.
 */
export function Confirmation({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-success text-sm mb-2 empty:mb-0">
      {children}
    </p>
  );
}

/** A titled group of rows inside a section. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-3">
        {title}
      </h4>
      {children}
    </div>
  );
}
