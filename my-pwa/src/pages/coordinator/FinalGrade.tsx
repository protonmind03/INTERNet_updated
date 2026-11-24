import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { saveCsv } from "../../lib/csv";
import { phStamp } from "../../lib/phTime";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 1.5: the final OJT grade, half the HTE's (the supervisor's final
| evaluation) and half the instructor's (the coordinator's four scores),
| as the OJT rule grade_split_hte says. The arithmetic is on the server
| (backend/src/services/finalGrade.ts); this shows it, takes the
| instructor's scores, and releases the grade to the student.
*/

type ScoreKey = "logs" | "punctuality" | "preparation" | "conduct";
type Scores = Record<ScoreKey, number>;
type State = "final" | "waiting_hte" | "waiting_instructor" | "waiting_both";

export type GradeRow = {
  student_id: string;
  name: string;
  program: string | null;
  block: string | null;
  hte: number | null;
  hte_by: string | null;
  instructor: number | null;
  scores: Scores | null;
  remarks: string | null;
  version: number | null;
  final: number | null;
  /** The final grade on the 1.00 to 5.00 scale. */
  equivalent: string | null;
  state: State;
  released_at: string | null;
  released_grade: number | null;
  released_equivalent: string | null;
  changed_since_release: boolean;
  weights: Scores;
};

type Suggestion = { score: number | null };
type Breakdown = {
  split: number;
  grade: GradeRow;
  suggestions: { punctuality: Suggestion & { on_time: number; counted: number }; logs: Suggestion & { submitted: number; expected: number } };
};

const SCORES: { key: ScoreKey; label: string; hint: string }[] = [
  { key: "logs", label: "Logs", hint: "Daily and weekly reports handed in." },
  { key: "punctuality", label: "Punctuality", hint: "Reports and documents handed in on time." },
  { key: "preparation", label: "Preparation", hint: "Requirements, orientation and readiness." },
  { key: "conduct", label: "Conduct", hint: "Behaviour and professionalism." },
];

const STATE_WORDS: Record<State, string> = {
  final: "Final",
  waiting_hte: "Waiting for HTE",
  waiting_instructor: "Waiting for instructor",
  waiting_both: "Waiting for HTE and instructor",
};

const shown = (value: number | null) => (value === null ? "None yet" : value.toFixed(2));
/** "2.00 (87.50)": the grade on the 1.00 to 5.00 scale, then the percentage. */
const finalText = (equivalent: string | null, percent: number | null) => (percent === null ? "None yet" : `${equivalent} (${percent.toFixed(2)})`);
const section = (row: Pick<GradeRow, "program" | "block">) => [row.program, row.block].filter(Boolean).join(" ") || "No program";

function weightedPreview(scores: Partial<Record<ScoreKey, string>>, weights: Scores): number | null {
  let total = 0;
  for (const { key } of SCORES) {
    const value = Number(scores[key]);
    if (scores[key] === undefined || scores[key] === "" || !Number.isFinite(value) || value < 0 || value > 100) return null;
    total += value * weights[key];
  }
  return Math.round((total / 100 + Number.EPSILON) * 100) / 100;
}

/** A grade's state as a chip, in the semantic colours. */
function GradeState({ row }: { row: GradeRow }) {
  if (row.released_at) {
    return row.changed_since_release ? <StatusBadge status="Changed since release" tone="waiting" /> : <StatusBadge status="Released" tone="good" />;
  }
  return <StatusBadge status={STATE_WORDS[row.state]} tone={row.state === "final" ? "info" : "neutral"} />;
}

function EvaluateButton({ row, onClick }: { row: GradeRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-psu-700 hover:bg-slate-100"
    >
      {row.scores ? "Edit scores" : "Evaluate"}
      <span className="sr-only"> for {row.name} ({row.student_id})</span>
    </button>
  );
}

/** The instructor's four scores, the suggestions already filled in. */
export function InstructorDialog({ studentId, open, onClose, onSaved }: { studentId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [scores, setScores] = useState<Partial<Record<ScoreKey, string>>>({});
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const loaded = await coordinatorRequest<Breakdown>(`/api/coordinator/students/${encodeURIComponent(studentId)}/final-grade`);
      setData(loaded);
      const current = loaded.grade.scores;
      const suggest = (value: number | null) => (value === null ? "" : String(value));
      setScores(
        current
          ? Object.fromEntries(SCORES.map(({ key }) => [key, String(current[key])]))
          : { logs: suggest(loaded.suggestions.logs.score), punctuality: suggest(loaded.suggestions.punctuality.score), preparation: "", conduct: "" }
      );
      setRemarks(loaded.grade.remarks ?? "");
    } catch (loadError) {
      setError(errorText(loadError, "The grade could not be loaded."));
    }
  }, [studentId]);

  useEffect(() => {
    if (open) void Promise.resolve().then(load);
  }, [open, load]);

  const after = data ? weightedPreview(scores, data.grade.weights) : null;
  const save = async () => {
    if (!data) return;
    if (after === null) {
      setError("Give each of the four a score from 0 to 100.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(SCORES.map(({ key }) => [key, Number(scores[key])]));
      const saved = await coordinatorRequest<{ message: string }>(`/api/coordinator/students/${encodeURIComponent(studentId)}/instructor-evaluation`, {
        method: "PUT",
        body: { ...body, remarks, version: data.grade.version },
      });
      toast.success(saved.message);
      onSaved();
      onClose();
    } catch (saveError) {
      if ((saveError as { code?: string }).code === "STALE") void load();
      setError(errorText(saveError, "The evaluation could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const suggestionHint = (key: ScoreKey): string | undefined => {
    if (!data) return undefined;
    if (key === "logs") {
      const logs = data.suggestions.logs;
      return logs.score === null ? "No report was expected yet, so there is no suggestion." : `Suggested ${logs.score}: ${logs.submitted} of ${logs.expected} reports handed in.`;
    }
    if (key === "punctuality") {
      const punctuality = data.suggestions.punctuality;
      return punctuality.score === null ? "Nothing was due yet, so there is no suggestion." : `Suggested ${punctuality.score}: ${punctuality.on_time} of ${punctuality.counted} on time.`;
    }
    return SCORES.find((item) => item.key === key)?.hint;
  };

  return (
    <ConfirmDialog
      open={open}
      title={data ? `Instructor evaluation of ${data.grade.name}` : "Instructor evaluation"}
      message="Each score is out of 100. Logs and punctuality start from what the records show; change them if you know better."
      confirmLabel="Save the evaluation"
      busy={saving}
      onConfirm={() => void save()}
      onCancel={onClose}
    >
      {!data ? (
        error ? <FormError message={error} /> : <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCORES.map(({ key, label }) => (
              <FormField key={key} label={`${label} (${data.grade.weights[key]}%)`} htmlFor={`score-${key}`} hint={suggestionHint(key)}>
                <input
                  id={`score-${key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  className="field"
                  value={scores[key] ?? ""}
                  onChange={(event) => setScores((current) => ({ ...current, [key]: event.target.value }))}
                />
              </FormField>
            ))}
          </div>
          <FormField label="Remarks" htmlFor="instructor-remarks" optional>
            <textarea id="instructor-remarks" className="field min-h-20" maxLength={2000} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </FormField>
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div>
              <dt className="text-slate-600">Instructor grade now</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{shown(data.grade.instructor)}</dd>
            </div>
            <div>
              <dt className="text-slate-600">After saving</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{shown(after)}</dd>
            </div>
          </dl>
          <FormError message={error} />
        </div>
      )}
    </ConfirmDialog>
  );
}

/** The breakdown on a student's record: HTE, instructor, final, and whether the student sees it. */
export function FinalGradeCard({ studentId }: { studentId: string }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<Breakdown>(`/api/coordinator/students/${encodeURIComponent(studentId)}/final-grade`, { signal: controller.signal })
      .then((loaded) => {
        setData(loaded);
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorText(loadError, "The final grade could not be loaded."));
      });
    return () => controller.abort();
  }, [studentId, reload]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-slate-900">Final grade</h2>
        <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>
          Instructor evaluation
        </Button>
      </div>
      {error ? (
        <div className="mt-3"><ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} /></div>
      ) : !data ? (
        <div className="mt-3"><SkeletonRows rows={3} /></div>
      ) : (
        <>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-slate-600">HTE ({data.split}%)</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-900">{shown(data.grade.hte)}</dd>
              {data.grade.hte_by && <dd className="text-xs text-slate-500">From {data.grade.hte_by}'s final evaluation</dd>}
            </div>
            <div>
              <dt className="text-sm text-slate-600">Instructor ({100 - data.split}%)</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-900">{shown(data.grade.instructor)}</dd>
              {data.grade.scores && (
                <dd className="text-xs text-slate-500">
                  {SCORES.map(({ key, label }) => `${label} ${data.grade.scores![key]}`).join(", ")}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-sm text-slate-600">Final</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-900">{finalText(data.grade.equivalent, data.grade.final)}</dd>
              <dd className="mt-1"><GradeState row={data.grade} /></dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-slate-600">
            {data.grade.released_at
              ? `Released ${phStamp(new Date(data.grade.released_at))}: the student sees ${finalText(data.grade.released_equivalent, data.grade.released_grade)}.`
              : "Not released: the student does not see a final grade yet. Release it from Evaluations."}
          </p>
        </>
      )}
      <InstructorDialog studentId={studentId} open={editing} onClose={() => setEditing(false)} onSaved={() => setReload((value) => value + 1)} />
    </Card>
  );
}

/** The grade sheet for the students the filter bar leaves: a program, a block, a term. */
export function GradeSheet({ query }: { query: string }) {
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [split, setSplit] = useState(50);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<{ split: number; students: GradeRow[] }>(`/api/coordinator/grade-sheet${query ? `?${query}` : ""}`, { signal: controller.signal })
      .then((data) => {
        setRows(data.students);
        setSplit(data.split);
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorText(loadError, "The grade sheet could not be loaded."));
      });
    return () => controller.abort();
  }, [query, reload]);

  const releasable = useMemo(() => (rows ?? []).filter((row) => row.state === "final" && (!row.released_at || row.changed_since_release)), [rows]);
  // "Release grades for BSIT 4A" when every row is one section; otherwise a count.
  const sections = useMemo(() => [...new Set(releasable.map(section))], [releasable]);
  const target = sections.length === 1 ? sections[0] : `${releasable.length} students`;

  const release = async () => {
    setBusy(true);
    try {
      await coordinatorRequest("/api/coordinator/grades/release", { method: "POST", body: { student_ids: releasable.map((row) => row.student_id) } });
      toast.success(`Grades released for ${target}.`);
      setReleasing(false);
      setReload((value) => value + 1);
    } catch (releaseError) {
      toast.error(errorText(releaseError, "The grades could not be released."));
    } finally {
      setBusy(false);
    }
  };

  const table = (rows ?? []).map((row) => [row.student_id, row.name, section(row), shown(row.hte), shown(row.instructor), shown(row.final), row.equivalent ?? "", row.released_at ? "Released" : STATE_WORDS[row.state]]);
  const head = ["Student ID", "Name", "Program and block", `HTE (${split}%)`, `Instructor (${100 - split}%)`, "Final (%)", "Grade (1.00 to 5.00)", "State"];
  const exportCsv = () => saveCsv([head, ...table], "internet-grade-sheet.csv");
  const exportPdf = async () => {
    try {
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      const doc = buildAnalyticsPdf([{ title: `Grade sheet: HTE ${split}%, instructor ${100 - split}%`, head, rows: table }], phStamp(new Date()), "INTERNet OJT Grade Sheet");
      doc.save("internet-grade-sheet.pdf");
    } catch (pdfError) {
      toast.error(errorText(pdfError, "The PDF could not be made."));
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-[16px] font-bold text-slate-900">Grade sheet</h2>
          <p className="text-sm text-slate-600">
            Final grade: HTE {split}%, instructor {100 - split}% (pending the university's confirmation), on the 1.00 to 5.00 scale. The student sees it only once released.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" disabled={!rows?.length} onClick={exportCsv}>CSV</Button>
          <Button variant="secondary" icon="printer" disabled={!rows?.length} onClick={() => void exportPdf()}>PDF</Button>
          <Button icon="check" disabled={releasable.length === 0} onClick={() => setReleasing(true)}>
            Release grades
          </Button>
        </div>
      </div>
      {error ? (
        <div className="p-4"><ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} /></div>
      ) : rows === null ? (
        <div className="p-4"><SkeletonRows rows={5} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="cap" title="No students in these choices" description="Choose a program or block in the filters above to see its grade sheet." />
      ) : (
        <>
          <table className="hidden w-full text-left text-sm md:table">
            <caption className="sr-only">Grade sheet</caption>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Student</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">HTE</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Instructor</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Final</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Grade</th>
                <th scope="col" className="px-4 py-2.5 font-medium">State</th>
                <th scope="col" className="px-2 py-2.5"><span className="sr-only">Instructor evaluation</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.student_id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {section(row)} <span className="font-mono">{row.student_id}</span>
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{shown(row.hte)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{shown(row.instructor)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{shown(row.final)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{row.equivalent ?? ""}</td>
                  <td className="px-4 py-2.5"><GradeState row={row} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <EvaluateButton row={row} onClick={() => setEditing(row.student_id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((row) => (
              <li key={row.student_id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {section(row)} <span className="font-mono">{row.student_id}</span>
                    </p>
                  </div>
                  <EvaluateButton row={row} onClick={() => setEditing(row.student_id)} />
                </div>
                <dl className="mt-1.5 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-slate-500">HTE</dt><dd className="tabular-nums">{shown(row.hte)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Instructor</dt><dd className="tabular-nums">{shown(row.instructor)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Final</dt><dd className="font-semibold tabular-nums">{finalText(row.equivalent, row.final)}</dd></div>
                </dl>
                <div className="mt-1.5"><GradeState row={row} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
      {editing && <InstructorDialog studentId={editing} open onClose={() => setEditing(null)} onSaved={() => setReload((value) => value + 1)} />}
      <ConfirmDialog
        open={releasing}
        title={`Release grades for ${target}?`}
        message={`${releasable.length === 1 ? "1 student sees" : `${releasable.length} students see`} their final grade as it is now, and ${releasable.length === 1 ? "is" : "are"} told. Grades still waiting for a half are left.`}
        confirmLabel={`Release grades for ${target}`}
        busy={busy}
        onConfirm={() => void release()}
        onCancel={() => setReleasing(false)}
      />
    </Card>
  );
}
