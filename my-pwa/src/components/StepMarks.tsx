/*
| Iteration 22: how each of a log's later steps was made, for the
| supervisor. "Confirmed with passkey", "Not confirmed" (no passkey, or the
| prompt was cancelled or failed), "Sent later" (recorded with no
| connection). It says how the record was made; it is not a verdict on it.
*/

export type StepVerifications = Partial<Record<"break" | "break-end" | "time-out", { method: "passkey" | "none" | "failed"; at: string; credentialId: string | null; reason?: string; camera?: "passed" | "failed" | "missing" | "offline" }>>;

const STEP_NAMES = { break: "Lunch break", "break-end": "End break", "time-out": "Time out" } as const;

export default function StepMarks({ verifications, sentLater, compact = false }: { verifications?: StepVerifications | null; sentLater?: boolean; compact?: boolean }) {
  const steps = (Object.keys(STEP_NAMES) as Array<keyof typeof STEP_NAMES>).filter((step) => verifications?.[step]);
  if (steps.length === 0 && !sentLater) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-1"}`} aria-label="How the steps were made">
      {steps.map((step) => {
        const mark = verifications![step]!;
        const confirmed = mark.method === "passkey";
        return (
          <li key={step} className={`status-chip min-h-6 text-xs ${confirmed ? "status-chip--success" : "status-chip--absent"}`} title={mark.reason}>
            {STEP_NAMES[step]}: {confirmed ? "Confirmed with passkey" : "Not confirmed"}
            {mark.camera ? ` · camera check ${mark.camera === "passed" ? "passed" : mark.camera === "offline" ? "not run (no connection)" : mark.camera === "missing" ? "not run" : "failed"}` : ""}
          </li>
        );
      })}
      {sentLater && <li className="status-chip status-chip--info min-h-6 text-xs">Sent later</li>}
    </ul>
  );
}
