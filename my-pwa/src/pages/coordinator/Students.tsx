import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "../../lib/api";
import { formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import ImportStudents from "./ImportStudents";
import { coordinatorRequest } from "./request";
import ResetPassword from "./ResetPassword";

type Student = {
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

type SupervisorOption = {
  supervisor_id: string;
  name: string;
  company: string | null;
  is_active: boolean;
};

// "unassigned" is active students who have no supervisor.
type StatusFilter = "all" | "active" | "inactive" | "unassigned";
type SortBy = "name" | "progress" | "supervisor";

const EMPTY_FORM = {
  student_id: "",
  email: "",
  password: "",
  name: "",
  program: "",
  company: "",
  supervisor_id: "",
  required_hours: "180",
};

export default function CoordinatorStudents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [status, setStatus] = useState<StatusFilter>(() =>
    searchParams.get("filter") === "unassigned" ? "unassigned" : "all"
  );
  const [sortBy, setSortBy] = useState<SortBy>("name");

  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [toggling, setToggling] = useState<Student | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const sorted = useMemo(() => {
    const progress = (student: Student) =>
      Number(student.required_hours) > 0
        ? Number(student.hours_rendered) / Number(student.required_hours)
        : 0;
    return [...students].sort((a, b) =>
      sortBy === "progress"
        ? progress(a) - progress(b)
        : sortBy === "supervisor"
          ? (a.supervisor_name || "").localeCompare(b.supervisor_name || "") ||
            a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name)
    );
  }, [students, sortBy]);
  const pager = usePagination(sorted, 20);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (status !== "all") params.set("status", status === "unassigned" ? "active" : status);
    try {
      const data = await coordinatorRequest<{ students: Student[] }>(
        `/api/coordinator/students?${params.toString()}`
      );
      const list = data.students || [];
      setStudents(
        status === "unassigned" ? list.filter((student) => !student.supervisor_name) : list
      );
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load students."));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  // Wait for typing to pause before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    coordinatorRequest<{ supervisors: SupervisorOption[] }>("/api/coordinator/supervisors")
      .then((data) => setSupervisors(data.supervisors || []))
      .catch(() => undefined);
  }, []);

  const toggle = async () => {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      await coordinatorRequest(
        `/api/coordinator/students/${encodeURIComponent(toggling.student_id)}/status`,
        { method: "PATCH", body: { is_active: !toggling.is_active } }
      );
      toast.success(
        toggling.is_active
          ? `${toggling.name}'s account is deactivated.`
          : `${toggling.name}'s account is active again.`
      );
      setToggling(null);
      await load();
    } catch (toggleError) {
      toast.error(errorText(toggleError, "The account could not be updated."));
    } finally {
      setToggleBusy(false);
    }
  };

  const filtered = search.trim() !== "" || status !== "all";

  return (
    <CoordinatorLayout
      title="Students"
      subtitle="Register OJT students, assign their supervisor and set their required hours."
      actions={
        <>
          <Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>
            Import
          </Button>
          <Button icon="plus" onClick={() => setEditing("new")}>
            Register student
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
            <SearchField
              value={search}
              onChange={setSearch}
              label="Search students"
              placeholder="Search name, ID, email or company"
              className="w-full sm:w-80"
            />
            <FilterChips
              label="Account status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "unassigned", label: "No supervisor" },
                { value: "inactive", label: "Deactivated" },
              ]}
            />
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
              Sort by
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                className="field w-auto"
              >
                <option value="name">Name</option>
                <option value="progress">Least progress first</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </label>
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : students.length === 0 ? (
            <EmptyState
              icon={filtered ? "search" : "users"}
              title={filtered ? "No students match" : "No students registered yet"}
              description={
                filtered ? undefined : "Register the first student to get the programme started."
              }
              action={
                filtered ? undefined : (
                  <Button icon="plus" onClick={() => setEditing("new")}>
                    Register student
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100 lg:hidden">
                {pager.pageItems.map((student) => (
                  <li key={student.student_id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={student.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/coordinator/students/${encodeURIComponent(student.student_id)}`}
                            className="truncate text-sm font-semibold text-slate-900 hover:text-psu-700 hover:underline"
                          >
                            {student.name}
                          </Link>
                          <StatusBadge status={student.is_active ? "Active" : "Deactivated"} tone={student.is_active ? "good" : "neutral"} />
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {student.student_id} · {student.email}
                        </p>
                        <p className="mt-1.5 text-sm text-slate-600">
                          {student.company || "No company"} ·{" "}
                          {student.supervisor_name || (
                            <span className="font-medium text-red-600">No supervisor</span>
                          )}
                        </p>
                        <p className="tabular text-sm text-slate-600">
                          {formatHours(student.hours_rendered)} of{" "}
                          {formatHours(student.required_hours)}
                        </p>
                        <RowActions
                          student={student}
                          onEdit={() => setEditing(student)}
                          onSchedule={() =>
                            navigate(
                              `/coordinator/requirements?student=${encodeURIComponent(student.student_id)}`
                            )
                          }
                          onToggle={() => setToggling(student)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Student</th>
                      <th scope="col" className="px-3 py-3 font-medium">Program</th>
                      <th scope="col" className="px-3 py-3 font-medium">Company</th>
                      <th scope="col" className="px-3 py-3 font-medium">Supervisor</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
                      <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pager.pageItems.map((student) => (
                      <tr key={student.student_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={student.name} size="sm" />
                            <div className="min-w-0">
                              <Link
                                to={`/coordinator/students/${encodeURIComponent(student.student_id)}`}
                                className="font-medium text-slate-900 hover:text-psu-700 hover:underline"
                              >
                                {student.name}
                              </Link>
                              <p className="text-xs text-slate-500">
                                {student.student_id} · {student.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{student.program || "—"}</td>
                        <td className="px-3 py-3 text-slate-700">{student.company || "—"}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {student.supervisor_name || (
                            <span className="font-medium text-red-600">Unassigned</span>
                          )}
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-700">
                          {formatHours(student.hours_rendered)} /{" "}
                          {formatHours(student.required_hours)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge
                            status={student.is_active ? "Active" : "Deactivated"}
                            tone={student.is_active ? "good" : "neutral"}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <RowActions
                            student={student}
                            compact
                            onEdit={() => setEditing(student)}
                            onSchedule={() =>
                              navigate(
                                `/coordinator/requirements?student=${encodeURIComponent(student.student_id)}`
                              )
                            }
                            onToggle={() => setToggling(student)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination state={pager} noun="student" />
            </>
          )}
        </Card>
      </div>

      <StudentDialog
        key={editing === "new" ? "new" : editing?.student_id ?? "closed"}
        target={editing}
        supervisors={supervisors}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />

      <ImportStudents
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          setImporting(false);
          void load();
        }}
      />

      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.is_active
            ? `Deactivate ${toggling.name}'s account?`
            : `Reactivate ${toggling?.name}'s account?`
        }
        message={
          toggling?.is_active
            ? "They will be signed out and will not be able to sign in. Their records are kept, and you can reactivate the account at any time."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        tone={toggling?.is_active ? "danger" : "primary"}
        busy={toggleBusy}
        onConfirm={() => void toggle()}
        onCancel={() => setToggling(null)}
      />
    </CoordinatorLayout>
  );
}

function RowActions({
  student,
  compact = false,
  onEdit,
  onSchedule,
  onToggle,
}: {
  student: Student;
  compact?: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onToggle: () => void;
}) {
  const base =
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-slate-100";
  return (
    <div className={`flex gap-1 ${compact ? "flex-nowrap justify-end whitespace-nowrap" : "mt-3 -ml-2 flex-wrap"}`}>
      <button type="button" onClick={onEdit} className={`${base} text-psu-700`}>
        <Icon name="edit" size={15} />
        Edit
      </button>
      <RowMenu
        label={`More actions for ${student.name}`}
        items={[
          { label: "Schedule", icon: "calendar", onSelect: onSchedule },
          student.is_active
            ? { label: "Deactivate account", icon: "close", tone: "danger", onSelect: onToggle }
            : { label: "Reactivate account", icon: "refresh", tone: "good", onSelect: onToggle },
        ]}
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| REGISTER / EDIT
|--------------------------------------------------------------------------
*/

function StudentDialog({
  target,
  supervisors,
  onClose,
  onSaved,
}: {
  target: Student | "new" | null;
  supervisors: SupervisorOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = target && target !== "new" ? target : null;
  const [form, setForm] = useState(() =>
    existing
      ? {
          student_id: existing.student_id,
          email: existing.email,
          password: "",
          name: existing.name,
          program: existing.program || "",
          company: existing.company || "",
          supervisor_id: existing.supervisor_id || "",
          required_hours: String(existing.required_hours || 180),
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  // Choosing a supervisor fills in their company when the field is empty.
  const chooseSupervisor = (supervisorId: string) => {
    const chosen = supervisors.find((item) => item.supervisor_id === supervisorId);
    setForm((current) => ({
      ...current,
      supervisor_id: supervisorId,
      company: current.company || chosen?.company || "",
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const hours = Number(form.required_hours);
    if (!form.name.trim()) return setError("Enter the student's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError("Enter a valid email address.");
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      return setError("Required hours must be a number greater than zero.");
    }
    if (!existing) {
      if (!form.student_id.trim()) return setError("Enter the student ID.");
      const policy = passwordPolicyError(form.password);
      if (policy) return setError(`Starting password: ${policy}`);
    }

    setSaving(true);
    setError("");
    try {
      const shared = {
        name: form.name.trim(),
        email: form.email.trim(),
        program: form.program.trim() || null,
        company: form.company.trim() || null,
        supervisor_id: form.supervisor_id || null,
        required_hours: hours,
      };
      if (existing) {
        await coordinatorRequest(
          `/api/coordinator/students/${encodeURIComponent(existing.student_id)}`,
          { method: "PUT", body: shared }
        );
        toast.success(`${shared.name}'s details are saved.`);
      } else {
        await coordinatorRequest("/api/coordinator/students", {
          method: "POST",
          body: { ...shared, student_id: form.student_id.trim(), password: form.password },
        });
        toast.success(`${shared.name} is registered. Give them their starting password.`);
      }
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The student could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      onClose={() => !saving && onClose()}
      title={existing ? "Edit student" : "Register a student"}
      description={existing ? existing.student_id : undefined}
      locked={saving}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : existing ? "Save changes" : "Register student"}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!existing && (
          <FormField label="Student ID" htmlFor="student-id" hint="The student can sign in with this.">
            <input
              id="student-id"
              type="text"
              maxLength={50}
              value={form.student_id}
              onChange={(event) => set("student_id")(event.target.value)}
              className="field"
            />
          </FormField>
        )}
        <FormField
          label="Full name"
          htmlFor="student-name"
          className={existing ? "sm:col-span-2" : ""}
        >
          <input
            id="student-name"
            type="text"
            maxLength={150}
            value={form.name}
            onChange={(event) => set("name")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Email" htmlFor="student-email">
          <input
            id="student-email"
            type="email"
            maxLength={150}
            value={form.email}
            onChange={(event) => set("email")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Program" htmlFor="student-program" optional>
          <input
            id="student-program"
            type="text"
            maxLength={150}
            value={form.program}
            onChange={(event) => set("program")(event.target.value)}
            placeholder="BS Information Technology"
            className="field"
          />
        </FormField>
        {!existing && (
          <FormField
            label="Starting password"
            htmlFor="student-password"
            hint={`${PASSWORD_POLICY_HINT} The student sets their own at first sign-in.`}
            className="sm:col-span-2"
          >
            <input
              id="student-password"
              type="text"
              autoComplete="off"
              value={form.password}
              onChange={(event) => set("password")(event.target.value)}
              className="field font-mono"
            />
          </FormField>
        )}
        <FormField label="Supervisor" htmlFor="student-supervisor" optional>
          <select
            id="student-supervisor"
            value={form.supervisor_id}
            onChange={(event) => chooseSupervisor(event.target.value)}
            className="field"
          >
            <option value="">Not assigned yet</option>
            {supervisors
              .filter((item) => item.is_active || item.supervisor_id === form.supervisor_id)
              .map((item) => (
                <option key={item.supervisor_id} value={item.supervisor_id}>
                  {item.name}
                  {item.company ? ` · ${item.company}` : ""}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Company" htmlFor="student-company" optional>
          <input
            id="student-company"
            type="text"
            maxLength={150}
            value={form.company}
            onChange={(event) => set("company")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Required hours" htmlFor="student-hours">
          <input
            id="student-hours"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={form.required_hours}
            onChange={(event) => set("required_hours")(event.target.value)}
            className="field"
          />
        </FormField>
        {existing && (
          <div className="sm:col-span-2">
            <ResetPassword
              kind="students"
              accountId={existing.student_id}
              name={existing.name}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
      </form>
    </Modal>
  );
}
