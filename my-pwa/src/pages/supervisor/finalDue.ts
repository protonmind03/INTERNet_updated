import { useEffect, useMemo, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { internPath } from "./internPath";
import type { Intern } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| FINAL EVALUATION DUE
|--------------------------------------------------------------------------
|
| An intern who is close to finishing, or has finished, their required
| hours and has no final evaluation yet is put in the Review queue, so the
| evaluation is not left until someone asks for it. Unlike the rest of the
| queue it is not something to approve or reject: it opens that intern's
| page on its Evaluate tab.
|
*/

/** Hours short of the requirement at which the evaluation is asked for. */
export const FINAL_DUE_WITHIN_HOURS = 40;

export type FinalDue = {
  kind: "final";
  key: string;
  entry: {
    student_id: string;
    student_name: string;
    hours_rendered: number;
    required_hours: number;
  };
};

/** Where a "final evaluation due" item leads. */
export const finalEvaluationPath = (studentId: string) => internPath(studentId, "evaluate");

/** True when this intern's hours put them within reach of finishing. */
export function nearlyDone(intern: Pick<Intern, "hours_rendered" | "required_hours">): boolean {
  const required = Number(intern.required_hours) || 0;
  const rendered = Number(intern.hours_rendered) || 0;
  return required > 0 && required - rendered <= FINAL_DUE_WITHIN_HOURS;
}

/**
 * The ids of the interns who already have a final evaluation, or null until
 * the server has said: an intern is never listed on a guess. Kept current
 * like the rest of the supervisor's lists (lib/liveRefresh.ts).
 */
export function useEvaluatedIds(): Set<string> | null {
  const [evaluated, setEvaluated] = useState<Set<string> | null>(null);
  const [tick, setTick] = useState(0);
  useLiveRefresh(() => setTick((value) => value + 1), 60_000);

  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/supervisor/final-evaluations`, withSupervisorAuth());
        const data = await response.json().catch(() => ({}));
        if (!current || !response.ok || !Array.isArray(data.student_ids)) return;
        setEvaluated(new Set((data.student_ids as unknown[]).map((id) => String(id).trim())));
      } catch {
        // No connection: nothing is listed until it can be checked.
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [tick]);

  return evaluated;
}

/** The interns whose final evaluation is due. Empty until the server has said who already has one. */
export function useFinalDue(interns: Intern[]): FinalDue[] {
  const evaluated = useEvaluatedIds();
  return useMemo(() => {
    if (!evaluated) return [];
    return interns
      .filter((intern) => nearlyDone(intern) && !evaluated.has(String(intern.student_id).trim()))
      .map((intern) => ({
        kind: "final" as const,
        key: `final-${intern.student_id}`,
        entry: {
          student_id: intern.student_id,
          student_name: intern.name,
          hours_rendered: Number(intern.hours_rendered) || 0,
          required_hours: Number(intern.required_hours) || 0,
        },
      }));
  }, [interns, evaluated]);
}
