import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import { savedFetch, type OfflineRole } from "./offlineStore";

/** A day nobody is expected to report, as the coordinator entered it. */
export type Holiday = { id: number; date: string; name: string };

/**
 * The holiday list, in date order. Extra to whichever page shows it: while
 * it loads, or if it cannot be loaded, the page simply shows no holidays.
 * The last list seen is kept for use without a connection.
 */
export function useHolidays(role: OfflineRole): Holiday[] {
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    let active = true;
    savedFetch(role, "holidays", `${API_URL}/api/holidays`, withRoleAuth(role))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.holidays)) setHolidays(data.holidays);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [role]);

  return holidays;
}
