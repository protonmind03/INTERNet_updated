import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";

type Student = {
  id: number;
  student_id: string;
  email: string;
  name: string;
  program: string | null;
  company: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  required_hours: number;
  hours_rendered: number;
  is_active: boolean;
};

const emptyForm = {
  student_id: "",
  email: "",
  password: "",
  name: "",
  program: "",
  company: "",
  supervisor_id: "",
  required_hours: 180,
};

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-blue-100 text-blue-600",
];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function colorFor(name: string) {
  const sum = name
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default function CoordinatorStudents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(
        `${API_URL}/api/coordinator/students?${params.toString()}`,
        withCoordinatorAuth()
      );

      if (response.status === 401) {
        navigate("/");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to load students.");
        return;
      }

      setStudents(data.students || []);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(loadStudents, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditingId(s.student_id);
    setForm({
      student_id: s.student_id,
      email: s.email,
      password: "",
      name: s.name,
      program: s.program || "",
      company: s.company || "",
      supervisor_id: s.supervisor_id || "",
      required_hours: s.required_hours || 180,
    });
    setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");

    if (!form.name || !form.email) {
      setFormError("Name and email are required.");
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        const response = await fetch(
          `${API_URL}/api/coordinator/students/${editingId}`,
          withCoordinatorAuth({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name,
              email: form.email,
              program: form.program || null,
              company: form.company || null,
              supervisor_id: form.supervisor_id || null,
              required_hours: form.required_hours,
            }),
          })
        );

        const data = await response.json();
        if (!response.ok) {
          setFormError(data.message || "Failed to update student.");
          return;
        }
      } else {
        if (!form.student_id || !form.password) {
          setFormError("Student ID and a starting password are required.");
          return;
        }

        const response = await fetch(
          `${API_URL}/api/coordinator/students`,
          withCoordinatorAuth({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        );

        const data = await response.json();
        if (!response.ok) {
          setFormError(data.message || "Failed to create student.");
          return;
        }
      }

      setShowModal(false);
      loadStudents();
    } catch {
      setFormError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (s: Student) => {
    try {
      await fetch(
        `${API_URL}/api/coordinator/students/${s.student_id}/status`,
        withCoordinatorAuth({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !s.is_active }),
        })
      );
      loadStudents();
    } catch {
      // silently ignore; the table just won't refresh
    }
  };

  return (
    <CoordinatorLayout
      title="Students"
      subtitle="Register, edit, and manage every OJT student account"
      breadcrumb={["Coordinator", "Management", "Students"]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search name, email, ID, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
            />

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(["all", "active", "inactive"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    statusFilter === s
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            + Register Student
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            <span>
              Showing {students.length} {students.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Program</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading students...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-red-400">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No students found.
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                students.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorFor(
                            s.name
                          )}`}
                        >
                          {initialsOf(s.name)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {s.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {s.student_id} · {s.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.program || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.company || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.supervisor_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.hours_rendered} / {s.required_hours}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          s.is_active
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {s.is_active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          title="Edit"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/coordinator/requirements?student=${encodeURIComponent(s.student_id)}`
                            )
                          }
                          title="Set OJT schedule"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M3 10h18M8 3v4M16 3v4" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(s)}
                          title={s.is_active ? "Deactivate" : "Activate"}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                            s.is_active
                              ? "bg-red-50 text-red-500 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}
                        >
                          {s.is_active ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? "Edit Student" : "Register Student"}
            </h2>

            {formError && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {formError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {!editingId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={form.student_id}
                    onChange={(e) =>
                      setForm({ ...form, student_id: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>

              {!editingId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Starting Password
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Student changes this after first login"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    At least 12 characters with an uppercase letter, a
                    lowercase letter, and a number. The student must replace
                    it at first login.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Program
                  </label>
                  <input
                    type="text"
                    value={form.program}
                    onChange={(e) =>
                      setForm({ ...form, program: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Required Hours
                  </label>
                  <input
                    type="number"
                    value={form.required_hours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        required_hours: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Company
                  </label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) =>
                      setForm({ ...form, company: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Supervisor ID
                  </label>
                  <input
                    type="text"
                    value={form.supervisor_id}
                    onChange={(e) =>
                      setForm({ ...form, supervisor_id: e.target.value })
                    }
                    placeholder="Assign a supervisor_id"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CoordinatorLayout>
  );
}
