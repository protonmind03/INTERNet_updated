import { useCallback, useEffect, useState } from "react";
import { Button, FormError, SkeletonRows } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import ScheduleDays from "./ScheduleDays";
import { badDayOf, weeklyHoursOf, type ScheduleRow } from "./scheduleRows";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S WEEKLY SCHEDULE, EDITABLE
|--------------------------------------------------------------------------
|
| The days and hours a student reports for OJT. The student sees it on
| their Schedule page, and the projections and attendance figures are
| worked out from it. It is edited on the Schedule tab of the student's
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
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
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
        schedule: { day: string; start_time: string; end_time: string; focus: string | null }[];
      }>(`/api/coordinator/students/${encodeURIComponent(studentId)}/schedule`);
      setSchedule(
        (data.schedule || []).map((row) => ({
          day: row.day,
          // The database returns "08:00:00"; a time input wants "08:00".
          start_time: (row.start_time || "").slice(0, 5),
          end_time: (row.end_time || "").slice(0, 5),
          focus: row.focus || "",
        }))
      );
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the schedule."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const weeklyHours = weeklyHoursOf(schedule);
  const badRow = badDayOf(schedule);

  const save = async () => {
    if (badRow) {
      setError(`${badRow.day}: the end time must be after the start time.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await coordinatorRequest(
        `/api/coordinator/students/${encodeURIComponent(studentId)}/schedule`,
        { method: "PUT", body: { schedule } }
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
          <span className="font-semibold">{formatHours(weeklyHours)}</span> a week planned
          {weeklyHours > 0 &&
            `, so about ${Math.ceil(requiredHours / weeklyHours)} weeks to finish ${formatHours(requiredHours)}.`}
          {weeklyHours === 0 && `. ${formatHours(requiredHours)} are required.`}
        </p>
      )}

      <ScheduleDays
        rows={schedule}
        onChange={(rows) => {
          setSchedule(rows);
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
