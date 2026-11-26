import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, SkeletonRows } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { directorRead, directorWrite } from "./request";

/*
| Approvals, grades (Phase 1.5): the Director releases final grades per
| program and block. The grade sheet (GET /api/coordinator/grade-sheet,
| which the Director may read) is grouped by section; a section's release
| names the students whose grade is final and not yet released (or changed
| since), through POST /api/coordinator/grades/release. The server releases
| each as it is then, tells the student, and leaves the rest. The
| coordinators enter the instructor's half on their Evaluations page.
*/

type State = "final" | "waiting_hte" | "waiting_instructor" | "waiting_both";
type GradeRow = {
  student_id: string;
  program: string | null;
  block: string | null;
  state: State;
  released_at: string | null;
  changed_since_release: boolean;
};
type Section = { name: string; students: number; released: number; waiting: number; ready: string[] };
type Released = { released: { student_id: string }[]; left: { waiting: number; already_released: number; not_found: number; changed_meanwhile: number } };

/** The server takes this many students a call. */
const BATCH = 500;

const sectionOf = (row: GradeRow) => [row.program, row.block].filter(Boolean).join(" ") || "No program";
const students = (count: number) => `${count} ${count === 1 ? "student" : "students"}`;

function sectionsOf(rows: GradeRow[]): Section[] {
  const by = new Map<string, Section>();
  for (const row of rows) {
    const name = sectionOf(row);
    const section = by.get(name) ?? { name, students: 0, released: 0, waiting: 0, ready: [] };
    section.students += 1;
    if (row.released_at && !row.changed_since_release) section.released += 1;
    else if (row.state === "final") section.ready.push(row.student_id);
    else section.waiting += 1;
    by.set(name, section);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function ApprovalGrades({ college }: { college: number | null }) {
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [split, setSplit] = useState(50);
  const [error, setError] = useState("");
  const [releasing, setReleasing] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = college === null ? "" : `?college=${college}`;
    try {
      const data = await directorRead<{ split: number; students: GradeRow[] }>(`approvals-grades${query}`, `/api/coordinator/grade-sheet${query}`);
      setRows(data.students);
      setSplit(data.split);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The grades could not be loaded. Check your connection and try again."));
    }
  }, [college]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const sections = useMemo(() => sectionsOf(rows ?? []), [rows]);

  const release = async () => {
    if (!releasing) return;
    setBusy(true);
    try {
      let done = 0;
      let changed = 0;
      for (let start = 0; start < releasing.ready.length; start += BATCH) {
        const result = await directorWrite<Released>("/api/coordinator/grades/release", "POST", { student_ids: releasing.ready.slice(start, start + BATCH) });
        done += result.released.length;
        changed += result.left.changed_meanwhile + result.left.waiting;
      }
      toast.success(
        changed > 0
          ? `Grades released for ${releasing.name}: ${students(done)}. ${students(changed)} changed meanwhile and were left; check them again.`
          : `Grades released for ${releasing.name}.`
      );
    } catch (releaseError) {
      toast.error(errorText(releaseError, "The grades could not be released. Check your connection and try again."));
    } finally {
      setBusy(false);
      setReleasing(null);
      await load();
    }
  };

  const action = (section: Section) =>
    section.ready.length > 0 ? (
      <Button variant="secondary" onClick={() => setReleasing(section)}>
        Release grades for {section.name}
      </Button>
    ) : (
      <span className="text-sm text-slate-600">{section.released === section.students ? "All released" : "Nothing ready to release"}</span>
    );

  return (
    <>
      <p className="mb-3 max-w-[65ch] text-sm text-slate-700">
        Final grade: HTE {split}%, instructor {100 - split}% (pending the university's confirmation). A student sees theirs only once it is released.
      </p>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      <Card className="overflow-hidden">
        {!rows && !error ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : sections.length === 0 ? (
          <EmptyState icon="cap" title="No students here yet" description="Coordinators add students on their Students page. Their grades show here by program and block." />
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <caption className="sr-only">Final grades by program and block</caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Program and block</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Students</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Released</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Ready</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Waiting for a half</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Release</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sections.map((section) => (
                  <tr key={section.name}>
                    <th scope="row" className="px-4 py-2.5 font-semibold text-(--role-ink)">{section.name}</th>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.students}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.released}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.ready.length}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.waiting}</td>
                    <td className="px-4 py-1.5 text-right">{action(section)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-slate-100 md:hidden">
              {sections.map((section) => (
                <li key={section.name} className="px-4 py-3">
                  <p className="font-semibold text-(--role-ink)">{section.name}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {section.released} of {students(section.students)} released, {section.ready.length} ready, {section.waiting} waiting for a half.
                  </p>
                  <div className="mt-2">{action(section)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={releasing !== null}
        title={releasing ? `Release grades for ${releasing.name}?` : ""}
        message={
          releasing
            ? `Now: ${releasing.released} of ${students(releasing.students)} released. After: ${releasing.released + releasing.ready.length} of ${releasing.students}. ${
                releasing.ready.length === 1 ? "1 student sees" : `${releasing.ready.length} students see`
              } their final grade as it is now, and ${releasing.ready.length === 1 ? "is" : "are"} told.${
                releasing.waiting > 0 ? ` ${students(releasing.waiting)} still waiting for the HTE or the instructor ${releasing.waiting === 1 ? "is" : "are"} left.` : ""
              }`
            : undefined
        }
        confirmLabel={releasing ? `Release grades for ${releasing.name}` : ""}
        busy={busy}
        onConfirm={() => void release()}
        onCancel={() => setReleasing(null)}
      />
    </>
  );
}
