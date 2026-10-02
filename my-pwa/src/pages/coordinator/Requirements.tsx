import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
 * Coordinator use case "Set OJT Requirements":
 *  - the documents every student must submit, and
 *  - each student's weekly OJT schedule.
 * Required hours stay on the student's account (Students page).
 */

type Requirement = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type StudentOption = {
  student_id: string;
  name: string;
  company: string | null;
  required_hours: number;
};

type ScheduleRow = { day: string; start_time: string; end_time: string; focus: string };

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

export default function CoordinatorRequirements() {
  return (
    <CoordinatorLayout
      title="Requirements"
      subtitle="The documents every student must submit, and each student's weekly schedule."
    >
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <RequiredDocuments />
        <StudentSchedule />
      </div>
    </CoordinatorLayout>
  );
}

/*
|--------------------------------------------------------------------------
| REQUIRED DOCUMENTS
|--------------------------------------------------------------------------
*/

function RequiredDocuments() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<Requirement | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ requirements: Requirement[] }>(
        "/api/ojt-requirements?all=1"
      );
      setRequirements(data.requirements || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the requirements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) {
      setAddError("Enter a name for the requirement.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await coordinatorRequest("/api/coordinator/requirements", {
        method: "POST",
        body: {
          name: newName.trim(),
          description: newDescription.trim() || null,
          sort_order: requirements.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
          is_active: true,
        },
      });
      toast.success(`"${newName.trim()}" added to every student's checklist.`);
      setNewName("");
      setNewDescription("");
      await load();
    } catch (saveError) {
      setAddError(errorText(saveError, "The requirement could not be added."));
    } finally {
      setAdding(false);
    }
  };

  const update = async (requirement: Requirement, message: string) => {
    setSavingId(requirement.id);
    try {
      await coordinatorRequest(`/api/coordinator/requirements/${requirement.id}`, {
        method: "PUT",
        body: requirement,
      });
      toast.success(message);
      setEditing(null);
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The requirement could not be saved."));
    } finally {
      setSavingId(null);
    }
  };

  const active = requirements.filter((item) => item.is_active).length;

  return (
    <Card>
      <CardHeader
        title="Required documents"
        description={
          loading
            ? undefined
            : `${active} active. Retired items leave the checklist but keep their upload history.`
        }
      />
      <div className="mt-3">
        {error && (
          <div className="px-4 pb-3 sm:px-5">
            <ErrorNotice message={error} onRetry={() => void load()} />
          </div>
        )}
        {loading ? (
          <SkeletonRows rows={5} />
        ) : requirements.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="No requirements yet"
            description="Add the first document students must submit."
          />
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {requirements.map((item) =>
              editing?.id === item.id ? (
                <li key={item.id} className="space-y-3 bg-slate-50 px-4 py-4 sm:px-5">
                  <FormField label="Name" htmlFor={`requirement-name-${item.id}`}>
                    <input
                      id={`requirement-name-${item.id}`}
                      type="text"
                      maxLength={150}
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      className="field"
                    />
                  </FormField>
                  <FormField
                    label="Description"
                    htmlFor={`requirement-description-${item.id}`}
                    optional
                  >
                    <input
                      id={`requirement-description-${item.id}`}
                      type="text"
                      maxLength={300}
                      value={editing.description || ""}
                      onChange={(event) =>
                        setEditing({ ...editing, description: event.target.value })
                      }
                      className="field"
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      busy={savingId === item.id}
                      disabled={!editing.name.trim()}
                      onClick={() =>
                        void update(
                          { ...editing, name: editing.name.trim() },
                          "Requirement saved."
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </li>
              ) : (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-medium ${
                          item.is_active ? "text-slate-900" : "text-slate-500"
                        }`}
                      >
                        {item.name}
                      </p>
                      {!item.is_active && <StatusBadge status="Retired" tone="neutral" />}
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={savingId === item.id}
                      onClick={() =>
                        void update(
                          { ...item, is_active: !item.is_active },
                          item.is_active
                            ? `"${item.name}" retired.`
                            : `"${item.name}" restored to the checklist.`
                        )
                      }
                      className={`rounded-md px-2 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 ${
                        item.is_active ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {item.is_active ? "Retire" : "Restore"}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}

        <form
          onSubmit={add}
          className="space-y-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
          noValidate
        >
          <p className="text-sm font-semibold text-slate-900">Add a requirement</p>
          <FormField label="Name" htmlFor="new-requirement-name">
            <input
              id="new-requirement-name"
              type="text"
              maxLength={150}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="For example, Certificate of Completion"
              className="field"
            />
          </FormField>
          <FormField label="Description" htmlFor="new-requirement-description" optional>
            <input
              id="new-requirement-description"
              type="text"
              maxLength={300}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="What the student should upload"
              className="field"
            />
          </FormField>
          <FormError message={addError} />
          <Button type="submit" icon="plus" busy={adding}>
            Add requirement
          </Button>
        </form>
      </div>
    </Card>
  );
}

/*
|--------------------------------------------------------------------------
| STUDENT SCHEDULE
|--------------------------------------------------------------------------
*/

function StudentSchedule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("student") || "";

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    coordinatorRequest<{ students: StudentOption[] }>("/api/coordinator/students?status=active")
      .then((data) => setStudents(data.students || []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (studentId: string) => {
    setError("");
    setDirty(false);
    if (!studentId) {
      setSchedule([]);
      return;
    }
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
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  const usedDays = new Set(schedule.map((row) => row.day));
  const weeklyHours = schedule.reduce(
    (sum, row) => sum + hoursBetween(row.start_time, row.end_time),
    0
  );
  const student = students.find((item) => item.student_id === selected);
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
        `/api/coordinator/students/${encodeURIComponent(selected)}/schedule`,
        { method: "PUT", body: { schedule } }
      );
      toast.success(`Schedule saved. ${student?.name || "The student"} has been notified.`);
      setDirty(false);
    } catch (saveError) {
      setError(errorText(saveError, "The schedule could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Student schedule"
        description="The student sees this on their Schedule page."
      />
      <div className="mt-3 space-y-4 border-t border-slate-100 px-4 py-4 sm:px-5">
        <FormField label="Student" htmlFor="schedule-student">
          <select
            id="schedule-student"
            value={selected}
            onChange={(event) =>
              setSearchParams(event.target.value ? { student: event.target.value } : {})
            }
            className="field"
          >
            <option value="">Choose a student</option>
            {students.map((item) => (
              <option key={item.student_id} value={item.student_id}>
                {item.name}
                {item.company ? ` · ${item.company}` : ""}
              </option>
            ))}
          </select>
        </FormField>

        {!selected ? (
          <p className="text-sm text-slate-500">
            Choose a student to set the days and hours they report for OJT.
          </p>
        ) : loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            {student && (
              <p className="rounded-lg bg-psu-50 px-3 py-2.5 text-sm text-psu-900">
                <span className="font-semibold">{formatHours(weeklyHours)}</span> a week planned
                {weeklyHours > 0 &&
                  `, so about ${Math.ceil(student.required_hours / weeklyHours)} weeks to finish ${formatHours(student.required_hours)}.`}
                {weeklyHours === 0 && `. ${formatHours(student.required_hours)} are required.`}
              </p>
            )}

            {schedule.length === 0 ? (
              <p className="text-sm text-slate-500">No working days yet. Add the first one.</p>
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
                        {DAYS.filter((name) => name === row.day || !usedDays.has(name)).map(
                          (name) => (
                            <option key={name}>{name}</option>
                          )
                        )}
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
              <Button
                variant="secondary"
                icon="plus"
                onClick={addDay}
                disabled={usedDays.size >= DAYS.length}
              >
                Add a day
              </Button>
              <Button onClick={() => void save()} busy={saving} disabled={!dirty}>
                {saving ? "Saving" : "Save schedule"}
              </Button>
              {dirty && !saving && (
                <p className="self-center text-sm text-amber-700">Unsaved changes</p>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
