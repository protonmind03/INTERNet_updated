import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import { Button, FormError, SkeletonRows } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S WEEKLY SCHEDULE, EDITABLE
|--------------------------------------------------------------------------
|
| The days and hours a student reports for OJT. The student sees it on
| their Schedule page, and the projections and attendance figures are
| worked out from it. It is edited in two places, with this one editor:
| the Schedule tab of the student's record, and the Requirements page.
|
*/

type ScheduleRow = { day: string; start_time: string; end_time: string; focus: string };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

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

  const usedDays = new Set(schedule.map((row) => row.day));
  const weeklyHours = schedule.reduce(
    (sum, row) => sum + hoursBetween(row.start_time, row.end_time),
    0
  );
  const badRow = schedule.find((row) => hoursBetween(row.start_time, row.end_time) <= 0);

  const change = (index: number, patch: Partial<ScheduleRow>) => {
    setSchedule((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const addDay = () => {
    const day = DAYS.find((name) => !usedDays.has(name));
    if (!day) return;
    setSchedule((rows) =>
      [...rows, { day, start_time: "08:00", end_time: "17:00", focus: "" }].sort(
        (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      )
    );
    setDirty(true);
  };

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

      {schedule.length === 0 ? (
        <p className="text-sm text-slate-600">No working days yet. Add the first one.</p>
      ) : (
        <ul className="space-y-3">
          {schedule.map((row, index) => (
            <li
              key={row.day}
              className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem]"
            >
              <label className="col-span-2 sm:col-span-1">
                <span className="sr-only">Day</span>
                <select
                  value={row.day}
                  onChange={(event) => change(index, { day: event.target.value })}
                  className="field"
                >
                  {DAYS.filter((name) => name === row.day || !usedDays.has(name)).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">{row.day} start time</span>
                <input
                  type="time"
                  value={row.start_time}
                  onChange={(event) => change(index, { start_time: event.target.value })}
                  className="field"
                />
              </label>
              <label>
                <span className="sr-only">{row.day} end time</span>
                <input
                  type="time"
                  value={row.end_time}
                  onChange={(event) => change(index, { end_time: event.target.value })}
                  className="field"
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${row.day}`}
                onClick={() => {
                  setSchedule((rows) => rows.filter((_, i) => i !== index));
                  setDirty(true);
                }}
                className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 sm:col-span-1 sm:w-10"
              >
                <Icon name="trash" size={16} />
                <span className="sm:hidden">Remove</span>
              </button>
              <label className="col-span-2 sm:col-span-4">
                <span className="sr-only">{row.day} focus</span>
                <input
                  type="text"
                  maxLength={150}
                  value={row.focus}
                  onChange={(event) => change(index, { focus: event.target.value })}
                  placeholder="What the day is for (optional)"
                  className="field"
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      <FormError message={error} />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="plus" onClick={addDay} disabled={usedDays.size >= DAYS.length}>
          Add a day
        </Button>
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
