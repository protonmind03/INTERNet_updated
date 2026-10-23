import { useEffect, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";

export type CoordinatorContact = { coordinator_id: number | string; name: string; email: string; department?: string | null };

// Asked for once per sign-in, however many pages are opened.
const known = new Map<string, CoordinatorContact | null>();

/**
 * The OJT coordinator a supervisor writes to, from their own profile.
 * Asked for only when `wanted` (the Messages page is open), and null until
 * it is known or when there is none.
 */
export function useCoordinatorContact(
  supervisorId: string | undefined,
  wanted: boolean
): CoordinatorContact | null {
  const [contact, setContact] = useState<CoordinatorContact | null>(
    () => (supervisorId && known.get(supervisorId)) || null
  );

  useEffect(() => {
    if (!wanted || !supervisorId || known.has(supervisorId)) return;
    let current = true;
    void (async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/supervisors/${encodeURIComponent(supervisorId)}/profile`,
          withSupervisorAuth()
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const found: CoordinatorContact | null =
          data.coordinator && data.coordinator.email ? data.coordinator : null;
        known.set(supervisorId, found);
        if (current) setContact(found);
      } catch {
        // No connection: the menu simply does not show the line.
      }
    })();
    return () => {
      current = false;
    };
  }, [wanted, supervisorId]);

  return contact;
}
