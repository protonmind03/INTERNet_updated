import { useCallback, useEffect, useState } from "react";
import { Button, FormError, SkeletonRows } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import SchedulePatternFields from "./SchedulePatternFields";
import { patternBody, patternHoursOf, patternProblem, type PatternForm, type ScheduleRow } from "./scheduleRows";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S WEEKLY SCHEDULE, EDITABLE
|--------------------------------------------------------------------------
|
| The days and hours a student reports for OJT, repeating every week or
| every two weeks (Iteration 11). The student sees it on their Schedule
| page, and the expected end date and attendance figures are worked out
| from it. It is edited on the Schedule tab of the student's
| record. A whole block is given one schedule from the Programs or
| Students page (BlockScheduleDialog.tsx), with the same rows.
|
*/


/**
 * Give it a `key` of the student's id where the student can change, so
 * one student's unsaved rows are never shown under another's name.
 */
export default function ScheduleEditor({
  studentId,
  studentName,
  requiredHours,
  onSaved,
}: {
  studentId: string;
  studentName?: string;
  requiredHours?: number;
  /** Called after a save, for a page that shows the schedule elsewhere too. */
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<PatternForm>({ weeks: 1, anchor: "", week1: [], week2: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Closing or reloading the tab with an unsaved schedule asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const load = useCallback(async () => {
    setError("");
    setDirty(false);
    setLoading(true);
    try {
      const data = await coordinatorRequest<{
        schedule: { week?: number; day: string; start_time: string; end_time: string; focus: string | null }[];
        pattern?: { weeks: 1 | 2; anchor: string | null };
      }>(`/api/coordinator/students/${encodeURIComponent(studentId)}/schedule`);
      const rows = (week: number): ScheduleRow[] =>
        (data.schedule || [])
          .filter((row) => (row.week ?? 1) === week)
          .map((row) => ({
            day: row.day,
            // The database returns "08:00:00"; a time input wants "08:00".
            start_time: (row.start_time || "").slice(0, 5),
            end_time: (row.end_time || "").slice(0, 5),
            focus: row.focus || "",
          }));
      const two = data.pattern?.weeks === 2;
      setForm({ weeks: two ? 2 : 1, anchor: two ? data.pattern?.anchor || "" : "", week1: rows(1), week2: two ? rows(2) : [] });
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the schedule."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const weeklyHours = patternHoursOf(form);

  const save = async () => {
    const problem = patternProblem(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await coordinatorRequest(
        `/api/coordinator/students/${encodeURIComponent(studentId)}/schedule`,
        { method: "PUT", body: patternBody(form) }
      );
      toast.success(`Schedule saved. ${studentName || "The student"} has been notified.`);
      setDirty(false);
      onSaved?.();
    } catch (saveError) {
      setError(errorText(saveError, "The schedule could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonRows rows={3} />;

  return (
    <div className="space-y-4">
      {requiredHours !== undefined && (
        <p className="rounded-lg bg-psu-50 px-3 py-2.5 text-sm text-psu-900">
          <span className="font-semibold">{formatHours(weeklyHours)}</span> a week planned{form.weeks === 2 ? " on average" : ""}
          {weeklyHours > 0 &&
            `, so about ${Math.ceil(requiredHours / weeklyHours)} weeks to finish ${formatHours(requiredHours)}.`}
          {weeklyHours === 0 && `. ${formatHours(requiredHours)} are required.`}
        </p>
      )}

      <SchedulePatternFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setDirty(true);
        }}
      />

      <FormError message={error} />

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void save()}
          busy={saving}
          doneLabel="Saved"
          failed={Boolean(error)}
          disabled={!dirty}
        >
          {saving ? "Saving" : "Save schedule"}
        </Button>
        {dirty && !saving && <p className="self-center text-sm text-amber-700">Unsaved changes</p>}
      </div>
    </div>
  );
}
