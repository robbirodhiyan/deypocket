import { useEffect, useRef } from 'react';

// In-memory guard: when a form has unsaved changes, OTA is never reloaded.
// Each mounted form owns a unique token; multiple forms are supported.
const activeDrafts = new Set<symbol>();

export function hasUnsavedFinanceDraft(): boolean {
  return activeDrafts.size > 0;
}

/** Call in TransactionEditor (and any other form that may be dirty). */
export function useUnsavedFinanceDraft(isDirty: boolean): void {
  const token = useRef(Symbol('deypocket-finance-draft'));

  useEffect(() => {
    if (isDirty) activeDrafts.add(token.current);
    else activeDrafts.delete(token.current);
    return () => {
      activeDrafts.delete(token.current);
    };
  }, [isDirty]);
}
