import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import type { OfflineRole } from "./offlineStore";

/** When a student finishes at their scheduled pace, as the server works it out. */
export type Projection = {
  student_id: string;
  remaining_hours: number;
  weekly_hours: number;
  /** "YYYY-MM-DD", or null when it cannot be worked out or nothing is left. */
  projected_finish: string | null;
  at_risk: boolean;
  risk_reason: string;
};

/**
 * Projections by student ID: the signed-in student's own, a supervisor's
 * interns', or for the coordinator every active student (one term's when
 * `term` is given). Extra to the page that shows them: nothing is shown
 * while they load or if they cannot be loaded.
 */
export function useProjections(role: OfflineRole, term = ""): Map<string, Projection> {
  const [state, setState] = useState<{ term: string; byStudent: Map<string, Projection> }>({
    term: "",
    byStudent: new Map(),
  });

  useEffect(() => {
    let active = true;
    fetch(
      `${API_URL}/api/projections${term ? `?term=${encodeURIComponent(term)}` : ""}`,
      withRoleAuth(role)
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !Array.isArray(data?.projections)) return;
        setState({
          term,
          byStudent: new Map(
            (data.projections as Projection[]).map((item) => [item.student_id, item])
          ),
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [role, term]);

  // Never one term's figures under another term's filter.
  return state.term === term ? state.byStudent : EMPTY;
}

const EMPTY = new Map<string, Projection>();
