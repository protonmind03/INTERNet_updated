import { useCallback, useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import type { OfflineRole } from "./offlineStore";

/** A supervisor's certification of one month of a student's time record. */
export type DtrCertification = {
  id: number;
  student_id: string;
  /** "YYYY-MM" */
  month: string;
  certified_by_name: string;
  verified_hours: number;
  days_logged: number;
  certified_at: string;
};

/**
 * The certified months of one student's time record. Extra to the page
 * that shows it: while it loads, or if it cannot be loaded, the record is
 * simply shown without a certification line.
 */
export function useDtrCertifications(role: OfflineRole, studentId: string | undefined) {
  const [certifications, setCertifications] = useState<DtrCertification[]>([]);

  const reload = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/dtr-certifications/${encodeURIComponent(studentId)}`,
        withRoleAuth(role)
      );
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.certifications)) setCertifications(data.certifications);
    } catch {
      // Left as it was.
    }
  }, [role, studentId]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { certifications: studentId ? certifications.filter((item) => item.student_id === studentId) : [], reload };
}

/** Certifies a month, or withdraws a certification. Supervisor only. */
export async function changeDtrCertification(
  action: { certify: { student_id: string; month: string } } | { withdraw: number }
): Promise<string> {
  const certify = "certify" in action;
  const response = await fetch(
    certify
      ? `${API_URL}/api/dtr-certifications`
      : `${API_URL}/api/dtr-certifications/${action.withdraw}`,
    withRoleAuth("supervisor", {
      method: certify ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: certify ? JSON.stringify(action.certify) : undefined,
    })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The time record could not be updated.");
  return data.message as string;
}
