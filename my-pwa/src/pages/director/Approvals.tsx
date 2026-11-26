import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, EmptyState, ErrorNotice, FilterChips, SkeletonRows } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { formatDate } from "../../lib/format";
import { errorText } from "../../lib/toast";
import ApprovalAgencies from "./ApprovalAgencies";
import ApprovalGrades from "./ApprovalGrades";
import CollegeRail from "./CollegeRail";
import { useChosenCollege, type RailCollege } from "./useChosenCollege";
import { directorRead } from "./request";

/*
|--------------------------------------------------------------------------
| APPROVALS (Phase 1.6)
|--------------------------------------------------------------------------
|
| What the Director decides or looks over, under the college marks:
|
|   Agencies       approve or suspend a Host Training Establishment (1.3)
|   Grades         release final grades by program and block (1.5)
|   Cleared anyway every student cleared for deployment without
|                  everything in, with the coordinator's reason (1.2)
|
| The part shown is in the address (?part=), like the college.
|
*/

type Part = "agencies" | "grades" | "overrides";
const PARTS: Part[] = ["agencies", "grades", "overrides"];

type Student = {
  student_id: string;
  name: string;
  program: string | null;
  cleared: boolean;
  cleared_for_deployment_at: string | null;
  clearance_override_reason: string | null;
};
type Overview = { colleges: { college_id: number | null; college: string | null; short_name: string | null; mark_key: string | null }[] };

function Overrides({ college }: { college: number | null }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  // Only the latest load is shown: a slow answer for a college chosen before does not replace it.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const query = college === null ? "" : `?college=${college}`;
    const call = ++latest.current;
    try {
      const data = await directorRead<{ students: Student[]; truncated?: boolean }>(`clearance${query}`, `/api/coordinator/clearance${query}`);
      if (call !== latest.current) return;
      setStudents(data.students);
      setTruncated(Boolean(data.truncated));
      setError("");
    } catch (loadError) {
      if (call !== latest.current) return;
      setError(errorText(loadError, "The clearances could not be loaded. Check your connection and try again."));
    }
  }, [college]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setStudents(null);
      setError("");
      return load();
    });
  }, [load]);

  const overrides = (students ?? []).filter((row) => row.cleared && row.clearance_override_reason);

  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      {truncated && (
        <p role="status" className="mb-3 max-w-[65ch] text-sm font-medium text-amber-800">
          Only the first 2,000 students were looked through. Choose a college above to see the rest.
        </p>
      )}
      <Card>
        {!students ? (
          error ? null : (
            <div className="p-4">
              <SkeletonRows rows={3} />
            </div>
          )
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
    </>
  );
}

export default function DirectorApprovals() {
  const [params, setParams] = useSearchParams();
  const [chosen, choose] = useChosenCollege();
  const part = (PARTS as string[]).includes(params.get("part") ?? "") ? (params.get("part") as Part) : "agencies";
  const [rail, setRail] = useState<RailCollege[]>([]);

  useEffect(() => {
    directorRead<Overview>("overview", "/api/director/overview")
      .then((overview) =>
        setRail(
          overview.colleges
            .filter((row) => row.college_id !== null)
            .map((row) => ({ id: row.college_id!, name: row.college!, short_name: row.short_name, mark_key: row.mark_key }))
        )
      )
      // Without the marks the page still works for every college.
      .catch(() => setRail([]));
  }, []);

  const show = (next: Part) =>
    setParams(
      (current) => {
        const query = new URLSearchParams(current);
        if (next === "agencies") query.delete("part");
        else query.set("part", next);
        return query;
      },
      { replace: true }
    );

  return (
    <DirectorLayout title="Approvals">
      <div className="space-y-5">
        {rail.length > 0 && <CollegeRail colleges={rail} chosen={chosen} onChoose={choose} />}
        <FilterChips
          label="What to decide"
          value={part}
          onChange={show}
          options={[
            { value: "agencies", label: "Agencies" },
            { value: "grades", label: "Grades" },
            { value: "overrides", label: "Cleared anyway" },
          ]}
        />
        <div>
          {part === "agencies" && <ApprovalAgencies college={chosen} />}
          {part === "grades" && <ApprovalGrades college={chosen} />}
          {part === "overrides" && <Overrides college={chosen} />}
        </div>
      </div>
    </DirectorLayout>
  );
}
