import { useBlocker } from "@tanstack/react-router";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { UnsavedChangesContext } from "./unsaved-changes.ts";

export interface SettingsNavItem<Id extends string> {
  id: Id;
  label: string;
  /** The heading it's listed under: "Workspace" for the org's settings, "You" for the person's. */
  group: string;
}

/**
 * Settings as a short detour over the page the person was on (docs/UI.md): a large modal with
 * the sections on the left, grouped, and the chosen one on the right. On a phone it fills the
 * screen and shows the list first, then a section with a way back to it.
 *
 * The app behind it is inert while it's open; focus moves in, and back to whatever opened it on
 * close. Escape, × and the backdrop close it. Closing and switching section change the address,
 * so while a section holds unsaved changes (useUnsavedChanges) one router blocker asks before any
 * of them, and before Back or a link elsewhere; leaving the site gets the browser's own prompt.
 */
export function SettingsDialog<Id extends string>({
  sections,
  activeId,
  onSelect,
  onClose,
  children,
}: {
  sections: SettingsNavItem<Id>[];
  /** The section shown; null shows the list on a phone and the first section otherwise. */
  activeId: Id | null;
  onSelect: (id: Id | null) => void;
  onClose: () => void;
  /** The shown section's content. */
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(new Set());

  const report = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (prev.has(key) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const dirty = dirtyKeys.size > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });

  useEffect(() => {
    const app = document.getElementById("root");
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    app?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      app?.removeAttribute("inert");
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    // A menu inside the dialog handles its own Escape and marks it handled.
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
  };

  const shownId = activeId ?? sections[0]?.id;
  const showList = activeId === null;
  const groups = [...new Set(sections.map((s) => s.group))];
  const item =
    "block w-full px-3 py-2 md:py-1.5 rounded-button text-left text-sm text-text-muted hover:text-text";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div aria-hidden className="absolute inset-0 bg-backdrop" onMouseDown={() => onClose()} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex flex-col w-full h-full md:w-[min(1000px,92vw)] md:h-[min(720px,88vh)] md:rounded-card md:border md:border-border bg-surface-raised text-text shadow-2xl overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 h-14 px-5 border-b border-border shrink-0">
          <h2 id={titleId} className="font-semibold">
            Settings
          </h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => onClose()}
            className="px-2 py-1 rounded-button text-text-muted hover:text-text text-xl leading-none"
          >
            ×
          </button>
        </div>

        {blocker.status === "blocked" && (
          <div
            role="alertdialog"
            aria-label="Discard unsaved changes?"
            className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-border bg-surface text-sm"
          >
            <span className="flex-1 font-semibold">You have unsaved changes. Discard them?</span>
            <button
              type="button"
              className="border border-border rounded-button px-3 py-1.5"
              onClick={blocker.reset}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="bg-destructive text-destructive-fg rounded-button px-3 py-1.5"
              onClick={blocker.proceed}
            >
              Discard
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <nav
            aria-label="Settings sections"
            className={`w-full md:w-56 shrink-0 overflow-y-auto p-3 md:border-r md:border-border bg-surface ${showList ? "block" : "hidden md:block"}`}
          >
            {groups.map((group) => (
              <div key={group} className="mb-4">
                <div className="px-3 mb-1 text-xs font-semibold text-text-muted">{group}</div>
                <ul>
                  {sections
                    .filter((s) => s.group === group)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-current={s.id === shownId ? "page" : undefined}
                          // The section already shown stays put (on a phone's list, none is shown).
                          onClick={() => s.id !== activeId && onSelect(s.id)}
                          // On a phone the list stands alone, so no section is marked current.
                          className={`${item} hover:bg-surface-raised ${s.id === shownId ? "md:bg-surface-raised md:font-semibold md:text-text" : ""}`}
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
          <div
            className={`flex-1 min-w-0 overflow-y-auto ${showList ? "hidden md:block" : "block"}`}
          >
            {!showList && (
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="md:hidden px-6 pt-4 text-sm text-text-muted"
              >
                ← All settings
              </button>
            )}
            <UnsavedChangesContext.Provider value={report}>
              {children}
            </UnsavedChangesContext.Provider>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
