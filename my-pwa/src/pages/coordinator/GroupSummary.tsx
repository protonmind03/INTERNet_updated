import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyState, ProgressBar, SkeletonRows } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { fetchProgrammeReport, type ReportGroup } from "./programmeReport";

/*
|--------------------------------------------------------------------------
| THE SAME STUDENTS, BY PROGRAM AND BY BLOCK
|--------------------------------------------------------------------------
|
| The partner-company table's twins on Analytics: how the students of each
| program, and of each block, are getting on. The figures are the server's
| programme report (the one the exports are made from), for the students
| the coordinator's filters leave, so the screen and a downloaded file
| agree.
|
| A student linked to a program is counted under its name; one who is not
| is counted under the program text on their account. A student with no
| block is counted under "No block". Every student is in each table once.
|
*/

function GroupTable({ groups, heading }: { groups: ReportGroup[]; heading: string }) {
  return (
    // Scrolls sideways on a narrow screen, so it can be reached and scrolled from the keyboard.
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label={`Students by ${heading.toLowerCase()}`}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="table-head border-y border-slate-100 text-xs text-slate-600">
            <th scope="col" className="px-5 py-3 font-medium">{heading}</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Students</th>
            <th scope="col" className="px-3 py-3 font-medium">Average completion</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Verified hours</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Finished</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">At risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((group) => (
            <tr key={group.name} className="hover:bg-slate-50">
              <th scope="row" className="px-5 py-3 text-left font-medium text-slate-900">{group.name}</th>
              <td className="tabular px-3 py-3 text-right text-slate-700">{group.students}</td>
              <td className="px-3 py-3">
                <div className="flex min-w-32 items-center gap-2.5">
                  <ProgressBar
                    value={group.average_completion}
                    label={`${group.name}: ${group.average_completion} percent average completion`}
                  />
                  <span className="tabular shrink-0 text-slate-700">{group.average_completion}%</span>
                </div>
              </td>
              <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-700">
                {formatHours(group.verified_hours)}
              </td>
              <td className="tabular px-3 py-3 text-right text-slate-700">{group.completed}</td>
              <td
                className={`tabular px-5 py-3 text-right ${
                  group.at_risk > 0 ? "font-semibold text-slate-900" : "text-slate-600"
                }`}
              >
                {group.at_risk}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `query` is the coordinator's filters as sent to the server. */
export default function GroupSummary({ query }: { query: string }) {
  const [state, setState] = useState<{ query: string; programs: ReportGroup[]; blocks: ReportGroup[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    fetchProgrammeReport(query)
      .then((report) => {
        if (!current) return;
        setState({ query, programs: report.programs || [], blocks: report.blocks || [] });
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [query]);

  const loading = !state || state.query !== query;
  // Extra to the page: if it cannot be loaded the rest of Analytics stands.
  if (failed && loading) return null;

  const tables = [
    {
      key: "program",
      title: "By program",
      description: "The same students as the company table, summed by program",
      heading: "Program",
      groups: state?.programs ?? [],
      empty: "No active students",
    },
    {
      key: "block",
      title: "By block",
      description: "Summed by block. Students not yet placed in a block are under \"No block\".",
      heading: "Block",
      groups: state?.blocks ?? [],
      empty: "No active students",
    },
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      {tables.map((table) => (
        <Card key={table.key} className="min-w-0">
          <CardHeader title={table.title} description={table.description} />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={3} />
            ) : table.groups.length === 0 ? (
              <EmptyState icon="users" title={table.empty} />
            ) : (
              <GroupTable groups={table.groups} heading={table.heading} />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
