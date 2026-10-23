import { createContext, useContext, useEffect, useId } from "react";

/**
 * A part of a settings section tells the dialog it holds changes only an explicit action keeps
 * (an invitation typed but not sent), so closing or leaving the section asks first. Each part
 * reports under its own key, so one clean form never hides another's changes. Outside the
 * dialog nothing listens.
 */
export const UnsavedChangesContext = createContext<(key: string, dirty: boolean) => void>(() => {});

export function useUnsavedChanges(dirty: boolean): void {
  const report = useContext(UnsavedChangesContext);
  const key = useId();
  useEffect(() => {
    report(key, dirty);
    return () => report(key, false);
  }, [key, dirty, report]);
}
