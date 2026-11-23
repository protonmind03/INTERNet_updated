import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, EmptyState, ErrorNotice, FilterChips, SearchField, SkeletonRows, StatusBadge } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { errorText } from "../../lib/toast";
import CollegeRail from "./CollegeRail";
import { useChosenCollege, type RailCollege } from "./useChosenCollege";
import { directorRead } from "./request";

/*
| The students a count on the Overview stands for: read only, from the
| clearance board (GET /api/coordinator/clearance, which the Director may
| read). The college and what is shown are in the address.
*/

type Student = {
  student_id: string;
  name: string;
  program: string | null;
  program_id: number | null;
  company: string | null;
  cleared: boolean;
  ready: boolean;
  at_risk: boolean;
  clearance_override_reason: string | null;
  missing: string[];
};
type Show = "all" | "cleared" | "on_track" | "at_risk";
type Overview = { colleges: { college_id: number | null; college: string | null; short_name: string | null; mark_key: string | null }[] };

const SHOWS: Show[] = ["all", "cleared", "on_track", "at_risk"];

export default function DirectorStudents() {
  const [params, setParams] = useSearchParams();
  const [chosen, choose] = useChosenCollege();
  const noCollege = params.get("college") === "none";
  const show = (SHOWS as string[]).includes(params.get("show") ?? "") ? (params.get("show") as Show) : "all";
  const [students, setStudents] = useState<Student[] | null>(null);
  const [rail, setRail] = useState<RailCollege[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const query = chosen !== null ? `?college=${chosen}` : "";
      const [board, overview] = await Promise.all([
        directorRead<{ students: Student[] }>(`students${query}`, `/api/coordinator/clearance${query}`),
        directorRead<Overview>("overview", "/api/director/overview"),
      ]);
      setStudents(board.students);
      setRail(
        overview.colleges
          .filter((row) => row.college_id !== null)
          .map((row) => ({ id: row.college_id!, name: row.college!, short_name: row.short_name, mark_key: row.mark_key }))
      );
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The students could not be loaded. Check your connection and try again."));
    }
  }, [chosen]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const setShow = (next: Show) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "all") copy.delete("show");
        else copy.set("show", next);
        return copy;
      },
      { replace: true }
    );

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (students ?? []).filter((row) => {
      if (noCollege && row.program_id !== null) return false;
      if (show === "cleared" && !row.cleared) return false;
      if (show === "on_track" && row.at_risk) return false;
      if (show === "at_risk" && !row.at_risk) return false;
      return !text || `${row.name} ${row.student_id} ${row.program ?? ""} ${row.company ?? ""}`.toLowerCase().includes(text);
    });
  }, [students, noCollege, show, search]);

  const all = students ?? [];
  return (
    <DirectorLayout title="Students">
      <div className="space-y-4">
        {rail.length > 0 && <CollegeRail colleges={rail} chosen={chosen} onChoose={choose} />}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterChips<Show>
            label="Which students"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All", count: students ? all.length : undefined },
              { value: "cleared", label: "Cleared", count: students ? all.filter((row) => row.cleared).length : undefined },
              { value: "on_track", label: "On track", count: students ? all.filter((row) => !row.at_risk).length : undefined },
              { value: "at_risk", label: "At risk", count: students ? all.filter((row) => row.at_risk).length : undefined },
            ]}
          />
          <div className="sm:ml-auto sm:w-64">
            <SearchField value={search} onChange={setSearch} label="Search students" placeholder="Name, ID, company" />
          </div>
        </div>

        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          {!students && !error ? (
            <div className="p-4">
              <SkeletonRows rows={6} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="users"
              title={all.length ? "No student matches" : "No active students here"}
              description={all.length ? "Choose another college or another filter." : "Coordinators register students; they show here once they do."}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.student_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-(--role-ink)">{row.name}</p>
                    <p className="text-xs text-slate-600">
                      {row.student_id}
                      {row.program ? `, ${row.program}` : ""}
                      {row.company ? `, ${row.company}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge
                      status={row.cleared ? (row.clearance_override_reason ? "Cleared anyway" : "Cleared") : row.ready ? "Ready to clear" : "Not cleared"}
                      tone={row.cleared ? (row.clearance_override_reason ? "waiting" : "good") : "neutral"}
                    />
                    {row.at_risk && <StatusBadge status="At risk" tone="bad" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DirectorLayout>
  );
}
