import { useState } from "react";
import { Button, FormError, Modal } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import SchedulePatternFields from "./SchedulePatternFields";
import { patternBody, patternHoursOf, patternProblem, type PatternForm, type ScheduleRow } from "./scheduleRows";

/*
|--------------------------------------------------------------------------
| ONE SCHEDULE FOR A WHOLE BLOCK
|--------------------------------------------------------------------------
|
| Two steps. First the week is filled in and the block is checked: the
| server says who has no schedule, who has this one already, and who has a
| different one, and nothing is changed. Then it is applied: students with
| none always get it; those with a different one are overwritten or left,
| as chosen here. One student's schedule is still edited on their record.
|
*/

type Preview = {
  block: string;
  schedule: string;
  none: number;
  same: number;
  different: number;
  students: { student_id: string; name: string; state: "none" | "same" | "different"; current: string }[];
};

const WEEKDAYS: ScheduleRow[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
  day,
  start_time: "08:00",
  end_time: "17:00",
  focus: "",
}));

const people = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;

/** Mounted only while open, with a `key` of the block, so it always starts clean. */
export default function BlockScheduleDialog({
  blockId,
  blockName,
  onClose,
  onDone,
}: {
  blockId: number;
  blockName: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [form, setForm] = useState<PatternForm>({ weeks: 1, anchor: "", week1: WEEKDAYS, week2: [] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [existing, setExisting] = useState<"skip" | "overwrite">("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/coordinator/blocks/${blockId}/schedule`;
  const weekly = patternHoursOf(form);

  const check = async () => {
    const working = form.week1.length + (form.weeks === 2 ? form.week2.length : 0);
    if (working === 0) return setError("Add at least one working day.");
    const problem = patternProblem(form);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      setPreview(await coordinatorRequest<Preview>(`${path}/preview`, { method: "POST", body: patternBody(form) }));
      setExisting("skip");
    } catch (checkError) {
      setError(errorText(checkError, "The block could not be checked."));
    } finally {
      setBusy(false);
    }
  };

  const applyIt = async () => {
    setBusy(true);
    setError("");
    try {
      const done = await coordinatorRequest<{ message: string }>(path, {
        method: "PUT",
        body: { ...patternBody(form), existing },
      });
      toast.success(done.message);
      onDone?.();
      onClose();
    } catch (applyError) {
      setError(errorText(applyError, "The schedule could not be set."));
    } finally {
      setBusy(false);
    }
  };

  const willChange = preview ? preview.none + (existing === "overwrite" ? preview.different : 0) : 0;
  const different = preview?.students.filter((row) => row.state === "different") ?? [];

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Set schedule for ${blockName}`}
      description={
        preview
          ? "Nothing has been changed yet."
          : "One weekly schedule for every active student of this block. You see who it affects before anything changes."
      }
      size="lg"
      locked={busy}
      footer={
        preview ? (
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              Back to the week
            </Button>
            <Button onClick={() => void applyIt()} busy={busy} disabled={willChange === 0} failed={Boolean(error)}>
              {busy ? "Saving" : willChange === 0 ? "Nobody to change" : `Set schedule for ${people(willChange)}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void check()} busy={busy} failed={Boolean(error)}>
              {busy ? "Checking" : "Check the block"}
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-psu-50 px-3 py-2.5 text-sm text-psu-900">
            <span className="font-semibold">{formatHours(weekly)}</span> a week{form.weeks === 2 ? " on average" : ""}.
          </p>
          <SchedulePatternFields value={form} onChange={setForm} disabled={busy} />
          <FormError message={error} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-800">
            <span className="font-semibold">{preview.schedule}</span>
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["Have no schedule", preview.none, "They will get this one."],
              ["Already have this one", preview.same, "Nothing changes for them."],
              ["Have a different one", preview.different, "You choose below."],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <dt className="text-slate-600">{label}</dt>
                <dd className="tabular text-xl font-bold text-slate-900">{value}</dd>
                <dd className="text-xs text-slate-600">{note}</dd>
              </div>
            ))}
          </dl>

          {preview.students.length === 0 && (
            <p className="text-sm text-slate-700">{preview.block} has no active students.</p>
          )}

          {different.length > 0 && (
            <>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {people(different.length)} already {different.length === 1 ? "has" : "have"} a different schedule
                </p>
                <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" tabIndex={0} aria-label="Students with a different schedule">
                  {different.map((row) => (
                    <li key={row.student_id} className="px-3 py-2 text-sm">
                      <span className="font-medium text-slate-900">{row.name}</span>
                      <span className="block break-words text-xs text-slate-600">{row.current}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-slate-900">What should happen to theirs?</legend>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ["skip", "Skip them", "Their schedules stay as they are."],
                      ["overwrite", "Overwrite them", "Their schedules are replaced by this one, and they are told."],
                    ] as const
                  ).map(([value, label, note]) => (
                    <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                      <input
                        type="radio"
                        name="existing-schedules"
                        value={value}
                        checked={existing === value}
                        onChange={() => setExisting(value)}
                        className="mt-1 h-4 w-4 border-slate-400 text-psu-700"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-600">{note}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <FormError message={error} />
        </div>
      )}
    </Modal>
  );
}
