import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, ErrorNotice, SkeletonRows } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { errorText } from "../../lib/toast";
import CollegeRail from "./CollegeRail";
import { useChosenCollege, type RailCollege } from "./useChosenCollege";
import { directorRead } from "./request";

/*
|--------------------------------------------------------------------------
| CAMPUS OVERVIEW (Phase 1.6)
|--------------------------------------------------------------------------
|
| The campus at a glance (GET /api/director/overview): the college marks,
| one line saying where the campus stands, and a table by college. Each
| count opens the students it counts (Students). No figure tiles.
|
*/

type Row = {
  college_id: number | null;
  college: string | null;
  short_name: string | null;
  mark_key: string | null;
  interns: number;
  cleared: number;
  on_track: number;
  at_risk: number;
  agreements_ending: number;
};
type Overview = { campus: Omit<Row, "college_id" | "college" | "short_name" | "mark_key">; colleges: Row[] };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export default function DirectorOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [chosen, choose] = useChosenCollege();

  const load = useCallback(async () => {
    try {
      setData(await directorRead<Overview>("overview", "/api/director/overview"));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The campus overview could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const colleges = (data?.colleges ?? []).filter((row) => row.college_id !== null);
  const rail: RailCollege[] = colleges.map((row) => ({ id: row.college_id!, name: row.college!, short_name: row.short_name, mark_key: row.mark_key }));
  const rows = chosen === null ? data?.colleges ?? [] : colleges.filter((row) => row.college_id === chosen);
  const figures = chosen === null ? data?.campus : rows[0];
  const where = chosen === null ? "" : `&college=${chosen}`;
  const students = (college: number | null, show: string) =>
    `/director/students?${college === null ? "college=none" : `college=${college}`}${show ? `&show=${show}` : ""}`;

  return (
    <DirectorLayout title="Overview">
      <div className="space-y-5">
        {data && rail.length > 0 && <CollegeRail colleges={rail} chosen={chosen} onChoose={choose} />}

        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {figures && (
          <p className="max-w-[65ch] text-[17px] leading-relaxed text-(--role-ink)">
            <Link to={`/director/students?show=cleared${where}`} className="font-semibold underline decoration-(--role-accent) decoration-2 underline-offset-4">
              {figures.cleared} of {plural(figures.interns, "intern")}
            </Link>{" "}
            {figures.cleared === 1 ? "is" : "are"} cleared for deployment.{" "}
            {figures.agreements_ending > 0 ? (
              <>
                {plural(figures.agreements_ending, "agreement")} {figures.agreements_ending === 1 ? "ends" : "end"} within 30 days.
              </>
            ) : (
              "No agreement ends within 30 days."
            )}
          </p>
        )}

        <Card>
          {!data && !error ? (
            <div className="p-4">
              <SkeletonRows rows={6} />
            </div>
          ) : data && data.colleges.length === 0 ? (
            <EmptyState icon="cap" title="No colleges yet" description="Add the first college on Programs; its students then show here." />
          ) : data ? (
            <>
            {/* A phone: one short block a college, every count in sight. */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {rows.map((row) => (
                <li key={row.college_id ?? "none"} className="px-4 py-3">
                  <p className="font-semibold text-(--role-ink)">{row.college ?? "No program yet"}</p>
                  <ul className="mt-1.5 grid grid-cols-5 gap-1 tabular-nums">
                    {(
                      [
                        ["Interns", "Interns", row.interns, ""],
                        ["Cleared", "Cleared", row.cleared, "cleared"],
                        ["On track", "On track", row.on_track, "on_track"],
                        ["At risk", "At risk", row.at_risk, "at_risk"],
                        ["Ending", "Agreements ending within 30 days", row.agreements_ending, null],
                      ] as const
                    ).map(([short, label, value, show]) => {
                      const danger = show === "at_risk" && value > 0;
                      const cell = `flex min-h-11 w-full flex-col items-center justify-center rounded-md py-1 ${danger ? "bg-red-50 text-red-700" : "text-(--role-ink)"}`;
                      const inner = (
                        <>
                          <span className="text-base font-semibold">{value}</span>
                          <span className="text-[11px] text-slate-600">
                            {short}
                            <span className="sr-only">
                              {label === short ? "" : ` (${label})`}, {row.short_name || row.college || "no college"}
                            </span>
                          </span>
                        </>
                      );
                      return show === null ? (
                        <li key={short} className={cell}>
                          {inner}
                        </li>
                      ) : (
                        <li key={short}>
                        <Link
                          to={students(row.college_id, show)}
                          className={`${cell} focus-visible:outline-2 focus-visible:outline-(--role-ink)`}
                        >
                          {inner}
                        </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Interns by college</caption>
                <thead className="border-b border-(--role-hairline) text-[13px] text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">College</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Interns</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Cleared</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">On track</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">At risk</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Agreements ending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {rows.map((row) => {
                    // Each count opens the students it counts. At risk, when there are any, in the danger tone.
                    const count = (value: number, show: string, label: string, danger = false) => (
                      <Link
                        to={students(row.college_id, show)}
                        aria-label={`${label}, ${row.short_name || row.college || "no college"}: ${value}`}
                        className={`inline-flex min-h-11 min-w-11 items-center justify-end rounded-md px-2 font-semibold focus-visible:outline-2 focus-visible:outline-(--role-ink) ${
                          danger ? "bg-red-50 text-red-700 hover:bg-red-100" : "text-(--role-ink) hover:bg-slate-50"
                        }`}
                      >
                        {value}
                      </Link>
                    );
                    return (
                      <tr key={row.college_id ?? "none"}>
                        <th scope="row" className="px-4 py-1 font-medium text-(--role-ink)">
                          {row.college ?? "No program yet"}
                        </th>
                        <td className="px-1 py-1 text-right">{count(row.interns, "", "Interns")}</td>
                        <td className="px-1 py-1 text-right">{count(row.cleared, "cleared", "Cleared")}</td>
                        <td className="px-1 py-1 text-right">{count(row.on_track, "on_track", "On track")}</td>
                        <td className="px-1 py-1 text-right">{count(row.at_risk, "at_risk", "At risk", row.at_risk > 0)}</td>
                        <td className="px-4 py-1 text-right font-semibold text-(--role-ink)">{row.agreements_ending}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : null}
        </Card>
        {data && <p className="text-sm text-slate-600">At risk: the projection says they finish after the term ends.</p>}
      </div>
    </DirectorLayout>
  );
}
