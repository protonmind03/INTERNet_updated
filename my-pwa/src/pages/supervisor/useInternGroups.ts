import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { useAccount } from "../../lib/session";

/*
|--------------------------------------------------------------------------
| A SUPERVISOR'S INTERNS, BY PROGRAM AND BLOCK
|--------------------------------------------------------------------------
|
| A supervisor who takes interns from more than one program or section can
| narrow a page to one of them. A group is a block ("BSIT 4A") or, for an
| intern not yet placed in a block, their program. The choice is kept for
| the browser session, so it carries between the supervisor's pages.
|
*/

type Placed = { student_id: string; program: string | null; program_code?: string | null; block_name?: string | null };

/** What an intern's group is called. */
export function groupOf(intern: Placed): string {
  if (intern.block_name) return intern.block_name;
  const program = intern.program_code || (intern.program || "").trim();
  return program ? `${program}, no block` : "No program";
}

const STORE = "inb_supervisor_group";
// Asked for once per sign-in, by whichever page is opened first.
const known = new Map<string, Placed[]>();

export function useInternGroups() {
  const supervisor = useAccount("supervisor");
  const supervisorId = supervisor?.supervisor_id;
  const [interns, setInterns] = useState<Placed[]>(() => (supervisorId && known.get(supervisorId)) || []);
  const [group, setGroupState] = useState(() => {
    try {
      return sessionStorage.getItem(STORE) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!supervisorId || known.has(supervisorId)) return;
    let current = true;
    fetch(`${API_URL}/api/supervisor/${encodeURIComponent(supervisorId)}/interns`, withSupervisorAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.interns)) return;
        known.set(supervisorId, data.interns as Placed[]);
        if (current) setInterns(data.interns as Placed[]);
      })
      // Without the list there is simply nothing to choose between.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [supervisorId]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const intern of interns) counts.set(groupOf(intern), (counts.get(groupOf(intern)) ?? 0) + 1);
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [interns]);

  // A remembered group the supervisor no longer has an intern in is not applied.
  const applied = groups.length > 1 && groups.some((item) => item.label === group) ? group : "";
  const members = useMemo(
    () => (applied ? new Set(interns.filter((intern) => groupOf(intern) === applied).map((intern) => String(intern.student_id))) : null),
    [interns, applied]
  );

  const setGroup = useCallback((next: string) => {
    setGroupState(next);
    try {
      if (next) sessionStorage.setItem(STORE, next);
      else sessionStorage.removeItem(STORE);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }, []);

  /** True for an intern of the chosen group, and for everyone when none is chosen. */
  const has = useCallback((studentId: string) => !members || members.has(String(studentId)), [members]);

  return { group: applied, setGroup, groups, has };
}

export type InternGroupState = ReturnType<typeof useInternGroups>;
