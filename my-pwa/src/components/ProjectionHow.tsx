import { useState } from "react";
import { API_URL, withRoleAuth } from "../lib/api";
import type { SessionRole } from "../lib/session";
import { errorText } from "../lib/toast";

/*
| How an expected end date was worked out (GET /api/students/:id/projection,
| Iteration 11): the hours left, the schedule's pattern, the working days
| counted, the holidays and approved absences skipped. Asked for only when
| opened.
*/

export default function ProjectionHow({ role, studentId }: { role: SessionRole; studentId: string }) {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (steps || error) return;
    try {
      const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/projection`, withRoleAuth(role));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load how the date was worked out.");
      setSteps(data.projection?.how?.steps ?? []);
    } catch (failure) {
      setError(errorText(failure, "Could not load how the date was worked out."));
    }
  };

  return (
    <details
      className="mt-2 text-sm"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="inline-flex min-h-10 cursor-pointer items-center font-semibold text-psu-700 hover:underline">
        How this was worked out
      </summary>
      {error ? (
        <p role="alert" className="mt-1 text-red-700">
          {error}
        </p>
      ) : !steps ? (
        <p className="mt-1 text-slate-500" role="status">
          Loading…
        </p>
      ) : (
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-700">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </details>
  );
}
