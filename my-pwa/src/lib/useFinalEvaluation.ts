import { useCallback, useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import type { OfflineRole } from "./offlineStore";

export type FormCriterion = { key: string; label: string; description: string };

/** The form the supervisor fills in, as the coordinator keeps it. */
export type EvaluationForm = {
  id: number;
  name: string;
  scale_max: number;
  criteria: FormCriterion[];
  /** True while the form is the sample the system starts with. */
  is_sample: boolean;
};

/** A student's final evaluation, with the form as it was when submitted. */
export type FinalEvaluation = {
  id: number;
  student_id: string;
  form_snapshot: { name: string; scale_max: number; criteria: FormCriterion[] };
  supervisor_name: string;
  ratings: Record<string, number>;
  average: number;
  remarks: string;
  submitted_at: string;
  updated_at: string;
};

async function getJson<T>(role: OfflineRole, path: string): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, withRoleAuth(role));
  return response.ok ? ((await response.json()) as T) : null;
}

/**
 * One student's final evaluation, or null when there is none yet. `loaded`
 * turns true once the answer is in, so a page can tell "none" from "not
 * known yet".
 */
export function useFinalEvaluation(role: OfflineRole, studentId: string | undefined) {
  const [state, setState] = useState<{ for: string; evaluation: FinalEvaluation | null } | null>(
    null
  );

  const reload = useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await getJson<{ evaluation: FinalEvaluation | null }>(
        role,
        `/api/final-evaluations/${encodeURIComponent(studentId)}`
      );
      if (data) setState({ for: studentId, evaluation: data.evaluation });
    } catch {
      // Left as it was.
    }
  }, [role, studentId]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const current = state && state.for === studentId ? state : null;
  return { evaluation: current?.evaluation ?? null, loaded: current !== null, reload };
}

/** The evaluation form in use. */
export function useEvaluationForm(role: OfflineRole) {
  const [form, setForm] = useState<EvaluationForm | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await getJson<{ form: EvaluationForm | null }>(role, "/api/evaluation-form");
      if (data) setForm(data.form);
    } catch {
      // Left as it was.
    } finally {
      setLoaded(true);
    }
  }, [role]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { form, loaded, reload };
}
