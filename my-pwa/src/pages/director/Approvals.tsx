import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorNotice, SkeletonRows } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { formatDate } from "../../lib/format";
import { errorText } from "../../lib/toast";
import { directorRead } from "./request";

/*
| What the Director looks over (Phase 1.6). For now: every student cleared
| for deployment without everything in ("clear anyway"), with the
| coordinator's reason. Agency approvals (1.3) and grade release (1.5)
| join this page with their items.
*/

type Student = {
  student_id: string;
  name: string;
  program: string | null;
  cleared: boolean;
  cleared_for_deployment_at: string | null;
  clearance_override_reason: string | null;
};

export default function DirectorApprovals() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setStudents((await directorRead<{ students: Student[] }>("clearance", "/api/coordinator/clearance")).students);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The clearances could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const overrides = (students ?? []).filter((row) => row.cleared && row.clearance_override_reason);
  return (
    <DirectorLayout title="Approvals">
      <h2 className="mb-2 font-display text-lg font-bold text-(--role-ink)">Cleared without everything in</h2>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      <Card>
        {!students && !error ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : overrides.length === 0 ? (
          <EmptyState icon="check" title="No clearance given anyway" description="When a coordinator clears a student who is not ready, it shows here with their reason." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {overrides.map((row) => (
              <li key={row.student_id} className="px-4 py-3">
                <p className="font-semibold text-(--role-ink)">
                  {row.name}
                  <span className="font-normal text-slate-600"> {row.program ? `, ${row.program}` : ""}</span>
                </p>
                <p className="mt-1 max-w-[65ch] text-sm text-slate-800">{row.clearance_override_reason}</p>
                {row.cleared_for_deployment_at && <p className="mt-1 text-xs text-slate-600">Cleared {formatDate(row.cleared_for_deployment_at)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DirectorLayout>
  );
}
