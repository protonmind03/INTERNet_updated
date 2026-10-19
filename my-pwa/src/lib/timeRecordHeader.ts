import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import { savedFetch, type OfflineRole } from "./offlineStore";

/*
| Iteration 20: the Time Record's header and the trainee's signature, from
| the server (backend routes/timeRecord.ts), kept for offline use with the
| rest of the saved data (lib/offlineStore.ts).
*/

export type TimeRecordHeaderData = {
  institution: { republic_line: string; university_name: string; campus_name: string; locality_line: string; seal_asset: string };
  trainee: {
    student_id: string;
    name: string;
    college: string | null;
    program: string | null;
    program_linked: boolean;
    block: string | null;
    company: string | null;
    supervisor: string | null;
    required_hours: number | null;
    verified_hours: number;
  };
  signature: { id: number; created_at: string } | null;
};

export type SignatureImage = { id: number; svg_paths: string; png: string | null; width: number; height: number };

/** The header's data for one trainee, refreshed whenever `version` changes (an attendance change). */
export function useTimeRecordHeader(role: OfflineRole, studentId: string | undefined, version: unknown) {
  const [data, setData] = useState<TimeRecordHeaderData | null>(null);
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    savedFetch(role, "time-record-header", `${API_URL}/api/time-record/${encodeURIComponent(studentId)}/header`, withRoleAuth(role))
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active && body?.institution) setData(body as TimeRecordHeaderData);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [role, studentId, version]);
  return data;
}

/** A trainee's signature image: the active one, or a certified month's (`id`). */
export function useSignatureImage(role: OfflineRole, studentId: string | undefined, id: number | null | undefined) {
  const [image, setImage] = useState<SignatureImage | null>(null);
  useEffect(() => {
    if (!studentId || !id) {
      void Promise.resolve().then(() => setImage(null));
      return;
    }
    let active = true;
    savedFetch(role, `signature-${id}`, `${API_URL}/api/students/${encodeURIComponent(studentId)}/signature?id=${id}`, withRoleAuth(role))
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setImage(body?.signature ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [role, studentId, id]);
  return image;
}
