import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";

/*
 * Coordinator use case "Set OJT Requirements":
 *  - Required documents every student must submit (Feature 8).
 *  - Each student's weekly OJT schedule (student use case "View OJT Schedule").
 * Required hours stay on the student account form (Students page).
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
  is_active: boolean;
};

type ScheduleRow = {
  day: string;
  start_time: string;
  end_time: string;
  focus: string;
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function hoursBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function CoordinatorRequirements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ---------------- Required documents ---------------- */
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [reqError, setReqError] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editing, setEditing] = useState<Requirement | null>(null);

  const loadRequirements = useCallback(async () => {
    const response = await fetch(
      `${API_URL}/api/ojt-requirements?all=1`,
      withCoordinatorAuth()
    );
    if (response.status === 401) {
      navigate("/");
      return;
    }
    const data = await readJson(response);
    if (!response.ok) {
      setReqError(data.message || "Failed to load requirements.");
      return;
    }
    setRequirements(data.requirements || []);
  }, [navigate]);

  const saveRequirement = async (
    body: Partial<Requirement>,
    id?: number
  ) => {
    setReqError("");
    setReqMessage("");
    const response = await fetch(
      id
        ? `${API_URL}/api/coordinator/requirements/${id}`
        : `${API_URL}/api/coordinator/requirements`,
      withCoordinatorAuth({
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    const data = await readJson(response);
    if (!response.ok) {
      setReqError(data.message || "Failed to save requirement.");
      return false;
    }
    setReqMessage(data.message || "Saved.");
    await loadRequirements();
    return true;
  };

  const addRequirement = async () => {
    if (!newName.trim()) {
      setReqError("Enter a requirement name.");
      return;
    }
    const nextOrder =
      requirements.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
    const ok = await saveRequirement({
      name: newName.trim(),
      description: newDescription.trim() || null,
      sort_order: nextOrder,
      is_active: true,
    });
    if (ok) {
      setNewName("");
      setNewDescription("");
    }
  };

  /* ---------------- Student schedules ---------------- */
  const [students, setStudents] = useState<StudentOption[]>([]);
  const selectedStudent = searchParams.get("student") || "";
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");

  const loadStudents = useCallback(async () => {
    const response = await fetch(
      `${API_URL}/api/coordinator/students?status=active`,
      withCoordinatorAuth()
    );
    const data = await readJson(response);
    if (response.ok) setStudents(data.students || []);
  }, []);

  const loadSchedule = useCallback(async (studentId: string) => {
    setScheduleError("");
    setScheduleMessage("");
    if (!studentId) {
      setSchedule([]);
      return;
    }
    setScheduleLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/coordinator/students/${encodeURIComponent(studentId)}/schedule`,
        withCoordinatorAuth()
      );
      const data = await readJson(response);
      if (!response.ok) {
        setScheduleError(data.message || "Failed to load schedule.");
        return;
      }
      setSchedule(
        (data.schedule || []).map(
          (row: {
            day: string;
            start_time: string;
            end_time: string;
            focus: string | null;
          }) => ({
            day: row.day,
            start_time: row.start_time,
            end_time: row.end_time,
            focus: row.focus || "",
          })
        )
      );
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequirements();
      void loadStudents();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequirements, loadStudents]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSchedule(selectedStudent);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedStudent, loadSchedule]);

  const usedDays = new Set(schedule.map((row) => row.day));
  const weeklyHours = schedule.reduce(
    (sum, row) => sum + hoursBetween(row.start_time, row.end_time),
    0
  );
  const student = students.find((s) => s.student_id === selectedStudent);

  const updateRow = (index: number, patch: Partial<ScheduleRow>) =>
    setSchedule((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );

  const addDay = () => {
    const day = DAYS.find((d) => !usedDays.has(d));
    if (!day) return;
    setSchedule((rows) => [
      ...rows,
      { day, start_time: "08:00", end_time: "17:00", focus: "" },
    ]);
  };

  const saveSchedule = async () => {
    setScheduleError("");
    setScheduleMessage("");
    const response = await fetch(
      `${API_URL}/api/coordinator/students/${encodeURIComponent(selectedStudent)}/schedule`,
      withCoordinatorAuth({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule }),
      })
    );
    const data = await readJson(response);
    if (!response.ok) {
      setScheduleError(data.message || "Failed to save schedule.");
      return;
    }
    setScheduleMessage(
      `Schedule saved. The student has been notified (${data.weeklyHours} hours/week).`
    );
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400";

  return (
    <CoordinatorLayout
      title="OJT Requirements"
      subtitle="Set the documents students must submit and each student's OJT schedule"
      breadcrumb={["Coordinator", "Management", "OJT Requirements"]}
    >
      <div className="grid gap-6 2xl:grid-cols-2">
        {/* REQUIRED DOCUMENTS */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Required documents
            </h2>
            <p className="text-xs text-slate-400">
              Active items appear on every student's Documents checklist.
              Inactive items are hidden from new uploads but keep their history.
            </p>
          </div>

          <div className="space-y-2 px-5 py-4">
            {reqError && <p className="text-sm text-red-500">{reqError}</p>}
            {reqMessage && (
              <p className="text-sm text-emerald-600">{reqMessage}</p>
            )}

            <ul className="divide-y divide-slate-100">
              {requirements.map((r) => (
                <li key={r.id} className="py-2.5">
                  {editing?.id === r.id ? (
                    <div className="space-y-2">
                      <input
                        className={inputClass}
                        value={editing.name}
                        onChange={(e) =>
                          setEditing({ ...editing, name: e.target.value })
                        }
                      />
                      <input
                        className={inputClass}
                        placeholder="Description (optional)"
                        value={editing.description || ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            description: e.target.value,
                          })
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (await saveRequirement(editing, editing.id)) {
                              setEditing(null);
                            }
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            r.is_active
                              ? "text-slate-800"
                              : "text-slate-400 line-through"
                          }`}
                        >
                          {r.name}
                        </p>
                        {r.description && (
                          <p className="text-xs text-slate-400">
                            {r.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            saveRequirement(
                              { ...r, is_active: !r.is_active },
                              r.id
                            )
                          }
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                            r.is_active
                              ? "bg-red-50 text-red-500 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}
                        >
                          {r.is_active ? "Retire" : "Restore"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">
                Add requirement
              </p>
              <input
                className={inputClass}
                placeholder="e.g. Resume, Parent's Consent, Certificate of Completion"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
              <button
                type="button"
                onClick={addRequirement}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Add requirement
              </button>
            </div>
          </div>
        </section>

        {/* STUDENT SCHEDULE */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Student OJT schedule
            </h2>
            <p className="text-xs text-slate-400">
              Students see this on their Schedule page. Required hours are set
              on the student's account.
            </p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <select
              className={inputClass}
              value={selectedStudent}
              onChange={(e) =>
                setSearchParams(
                  e.target.value ? { student: e.target.value } : {}
                )
              }
            >
              <option value="">Select a student…</option>
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {s.name} ({s.student_id}){s.company ? ` · ${s.company}` : ""}
                </option>
              ))}
            </select>

            {selectedStudent && (
              <>
                {student && (
                  <p className="text-xs text-slate-500">
                    Required hours: {student.required_hours} · Planned:{" "}
                    {weeklyHours} hours/week
                    {weeklyHours > 0 &&
                      ` · about ${Math.ceil(
                        student.required_hours / weeklyHours
                      )} weeks to complete`}
                  </p>
                )}

                {scheduleLoading ? (
                  <p className="text-sm text-slate-400">Loading schedule…</p>
                ) : (
                  <div className="space-y-2">
                    {schedule.length === 0 && (
                      <p className="text-sm text-slate-400">
                        No schedule yet. Add the student's OJT days below.
                      </p>
                    )}
                    {schedule.map((row, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[1.2fr_1fr_1fr_1.5fr_auto]"
                      >
                        <select
                          className={inputClass}
                          value={row.day}
                          onChange={(e) =>
                            updateRow(index, { day: e.target.value })
                          }
                        >
                          {DAYS.filter(
                            (d) => d === row.day || !usedDays.has(d)
                          ).map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          className={inputClass}
                          value={row.start_time}
                          onChange={(e) =>
                            updateRow(index, { start_time: e.target.value })
                          }
                        />
                        <input
                          type="time"
                          className={inputClass}
                          value={row.end_time}
                          onChange={(e) =>
                            updateRow(index, { end_time: e.target.value })
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Focus (optional)"
                          value={row.focus}
                          onChange={(e) =>
                            updateRow(index, { focus: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSchedule((rows) =>
                              rows.filter((_, i) => i !== index)
                            )
                          }
                          className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {scheduleError && (
                  <p className="text-sm text-red-500">{scheduleError}</p>
                )}
                {scheduleMessage && (
                  <p className="text-sm text-emerald-600">{scheduleMessage}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addDay}
                    disabled={usedDays.size >= DAYS.length}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Add day
                  </button>
                  <button
                    type="button"
                    onClick={saveSchedule}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    Save schedule
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </CoordinatorLayout>
  );
}
