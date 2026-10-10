import { useCallback, useEffect, useState } from "react";
import { API_URL, withStudentAuth } from "../../lib/api";
import { savedFetch } from "../../lib/offlineStore";

export type PrivacyNotice = {
  version: string;
  /** True while the wording is a draft that nobody has approved. */
  placeholder: boolean;
  title: string;
  sections: { heading: string; body: string }[];
};

export type PrivacyState = {
  notice: PrivacyNotice;
  consent_at: string | null;
  consent_version: string | null;
  /** Agreed to the notice as it stands now. */
  current: boolean;
};

/**
 * The student's privacy state. `state` stays null while it loads and when
 * it cannot be loaded, and nothing is held up on it then: a time-in is
 * never blocked because the notice could not be fetched.
 */
export function usePrivacy(studentId: string | undefined) {
  const [state, setState] = useState<PrivacyState | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "privacy",
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/privacy`,
        withStudentAuth()
      );
      if (!response.ok) return;
      const data = (await response.json()) as PrivacyState;
      if (data?.notice?.version) setState(data);
    } catch {
      // Left as it was.
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const agree = useCallback(async () => {
    if (!studentId || !state) return;
    const response = await fetch(
      `${API_URL}/api/students/${encodeURIComponent(studentId)}/privacy/consent`,
      withStudentAuth({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: state.notice.version }),
      })
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The notice changed while it was open: show the new one.
      await load();
      throw new Error(data.message || "Your agreement could not be recorded.");
    }
    setState({
      ...state,
      consent_at: data.consent_at,
      consent_version: data.consent_version,
      current: true,
    });
  }, [studentId, state, load]);

  return { state, agree };
}
