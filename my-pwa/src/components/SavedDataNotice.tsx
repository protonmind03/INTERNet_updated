import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import { formatDateTime } from "../lib/format";
import { clearSavedNotice, useSavedSince } from "../lib/offlineStore";

/**
 * Shown at the top of a page when some of what it displays is the copy kept
 * on this device, because the server could not be reached. It says how old
 * the copy is, so nobody mistakes it for the current record.
 */
export default function SavedDataNotice() {
  const { pathname } = useLocation();
  const savedSince = useSavedSince();

  // Each page starts clean; what the last page showed says nothing about this one.
  useEffect(() => clearSavedNotice, [pathname]);

  if (!savedSince) return null;

  return (
    <p
      role="status"
      className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden"
    >
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      <span>
        Showing saved data from {formatDateTime(savedSince)}. It will update when your connection
        is back.
      </span>
    </p>
  );
}
