import { useCallback, useEffect, useState } from "react";
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
import { serverPagination } from "../../lib/usePagination";
import ImportAccounts from "./ImportAccounts";
import CompanyPicker from "./CompanyPicker";
import { coordinatorRequest } from "./request";
import FilterBar from "./FilterBar";
import BlockScheduleDialog from "./BlockScheduleDialog";
import { useStudentFilters } from "./useStudentFilters";
import ResetPassword from "./ResetPassword";
import { sameId } from "../../lib/ids";

type Student = {
  student_id: string;
  email: string;
  name: string;
  program: string | null;
  /** Where the student is placed, when they are linked to the records. */
  program_id?: number | null;
  major_id?: number | null;
  block_id?: number | null;
  college_id?: number | null;
  program_code?: string | null;
  major_name?: string | null;
  block_name?: string | null;
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
type StatusFilter = "all" | "active" | "inactive" | "unassigned" | "no-program";
type SortBy = "name" | "progress" | "supervisor";

/** Students shown at a time; the server sends one page of them. */
const PAGE_SIZE = 20;

/** The colleges, programs, majors and blocks the form's pickers choose from. */
type Academics = {
  colleges: { id: number; name: string; short_name: string | null; is_active: boolean }[];
  programs: { id: number; college_id: number; name: string; short_code: string; ojt_applies: boolean; is_active: boolean }[];
  majors: { id: number; program_id: number; name: string; is_active: boolean }[];
  blocks: { id: number; program_id: number; major_id: number | null; name: string; term_name: string | null; is_active: boolean }[];
};

const EMPTY_FORM = {
  student_id: "",
  email: "",
  password: "",
  name: "",
  program: "",
  college_id: "",
  program_id: "",
  major_id: "",
  block_id: "",
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
    searchParams.get("filter") === "unassigned" ? "unassigned" : searchParams.get("filter") === "no-program" ? "no-program" : "all"
  );
  const [sortBy, setSortBy] = useState<SortBy>("name");
  // Term, college, program, block, company and supervisor, shared with the
  // other coordinator pages. The server does the filtering.
  const studentFilters = useStudentFilters();
  const term = studentFilters.query;

  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [toggling, setToggling] = useState<Student | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingSchedule, setSettingSchedule] = useState(false);
  // The server searches, filters, orders and pages; only one page is here.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pager = serverPagination(students, total, page, PAGE_SIZE, setPage);
  // A changed search, filter or order starts again from the first page.
  const fromFirstPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
      sort: sortBy,
    });
    if (search.trim()) params.set("q", search.trim());
    if (status !== "all") params.set("status", status);
    try {
      const data = await coordinatorRequest<{ students: Student[]; total?: number }>(
        `/api/coordinator/students?${params.toString()}${term ? `&${term}` : ""}`
      );
      const list = data.students || [];
      setStudents(list);
      setTotal(data.total ?? list.length);
      // The last row of the last page was removed: step back to a page that has rows.
      if (list.length === 0 && page > 1) setPage(page - 1);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load students."));
    } finally {
      setLoading(false);
    }
  }, [search, status, term, sortBy, page]);

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

  const chosenBlock = studentFilters.options.blocks.find((block) => sameId(block.id, studentFilters.filters.block));

  return (
    <CoordinatorLayout
      title="Students"
      subtitle="Register OJT students, assign their supervisor and set their required hours."
      actions={
        <>
          {/* Offered once the filters are on one block. */}
          {chosenBlock && (
            <Button variant="secondary" icon="calendar" onClick={() => setSettingSchedule(true)}>
              Set schedule for this block
            </Button>
          )}
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
        <FilterBar state={studentFilters} />
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
            <SearchField
              value={search}
              onChange={fromFirstPage(setSearch)}
              label="Search students"
              placeholder="Search name, ID, email or company"
              // One row with the status chips and Sort by on a laptop screen (UX pass).
              className="w-full sm:w-72"
            />
            <FilterChips
              label="Account status"
              value={status}
              onChange={fromFirstPage(setStatus)}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "unassigned", label: "No supervisor" },
                { value: "no-program", label: "No linked program" },
                { value: "inactive", label: "Deactivated" },
              ]}
            />
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
              Sort by
              <select
                value={sortBy}
                onChange={(event) => fromFirstPage(setSortBy)(event.target.value as SortBy)}
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

              <div className="relative hidden overflow-x-auto lg:block">
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
                        <td className="px-3 py-3 text-slate-700">
                          {student.program || "—"}
                          {(student.block_name || student.major_name) && (
                            <span className="block text-xs text-slate-600">
                              {[student.block_name, student.major_name].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
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

      {settingSchedule && chosenBlock && (
        <BlockScheduleDialog
          key={chosenBlock.id}
          blockId={chosenBlock.id}
          blockName={chosenBlock.name}
          onClose={() => setSettingSchedule(false)}
        />
      )}

      <ImportAccounts
        kind="students"
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
          college_id: existing.college_id ? String(existing.college_id) : "",
          program_id: existing.program_id ? String(existing.program_id) : "",
          major_id: existing.major_id ? String(existing.major_id) : "",
          block_id: existing.block_id ? String(existing.block_id) : "",
          company: existing.company || "",
          supervisor_id: existing.supervisor_id || "",
          required_hours: String(existing.required_hours || 180),
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The pickers' lists. Without them (an older server, or no connection)
  // the form still takes the program as text, as it always did.
  const [academics, setAcademics] = useState<Academics | null>(null);
  useEffect(() => {
    let current = true;
    coordinatorRequest<Academics>("/api/coordinator/academics")
      .then((data) => {
        if (current && Array.isArray(data.programs)) setAcademics(data);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  // Each level leaves only what belongs to the one above it. A row that
  // has been made inactive is offered only while it is the one chosen.
  const programs = (academics?.programs ?? []).filter(
    (item) =>
      sameId(item.id, form.program_id) ||
      (item.is_active && item.ojt_applies && (!form.college_id || sameId(item.college_id, form.college_id)))
  );
  const majors = (academics?.majors ?? []).filter(
    (item) => sameId(item.program_id, form.program_id) && (item.is_active || sameId(item.id, form.major_id))
  );
  const blocks = (academics?.blocks ?? []).filter(
    (item) =>
      sameId(item.program_id, form.program_id) &&
      (item.is_active || sameId(item.id, form.block_id)) &&
      (!form.major_id || item.major_id === null || sameId(item.major_id, form.major_id))
  );
  const chooseCollege = (value: string) =>
    setForm((current) => {
      const program = academics?.programs.find((item) => sameId(item.id, current.program_id));
      const keeps = !value || !program || sameId(program.college_id, value);
      return keeps
        ? { ...current, college_id: value }
        : { ...current, college_id: value, program_id: "", major_id: "", block_id: "" };
    });
  const chooseProgram = (value: string) =>
    setForm((current) => {
      const program = academics?.programs.find((item) => sameId(item.id, value));
      return {
        ...current,
        program_id: value,
        // The college follows the program, so the two never disagree.
        college_id: program ? String(program.college_id) : current.college_id,
        major_id: "",
        block_id: "",
      };
    });
  const chooseMajor = (value: string) =>
    setForm((current) => {
      const block = academics?.blocks.find((item) => sameId(item.id, current.block_id));
      const keeps = !value || !block || block.major_id === null || sameId(block.major_id, value);
      return { ...current, major_id: value, block_id: keeps ? current.block_id : "" };
    });
  const chooseBlock = (value: string) =>
    setForm((current) => {
      const block = academics?.blocks.find((item) => sameId(item.id, value));
      // A block of one major says which major its students are of.
      return { ...current, block_id: value, major_id: block?.major_id ? String(block.major_id) : current.major_id };
    });

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  // Choosing a supervisor fills in their company when the field is empty.
  const chooseSupervisor = (supervisorId: string) => {
    const chosen = supervisors.find((item) => sameId(item.supervisor_id, supervisorId));
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
        // From the pickers. With no program chosen the three are empty and
        // the text above is what the student's program is.
        ...(academics
          ? {
              program_id: form.program_id ? Number(form.program_id) : null,
              major_id: form.program_id && form.major_id ? Number(form.major_id) : null,
              block_id: form.program_id && form.block_id ? Number(form.block_id) : null,
            }
          : {}),
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
        {academics && academics.programs.length > 0 && (
          <>
            <FormField label="College" htmlFor="student-college" optional>
              <select
                id="student-college"
                value={form.college_id}
                onChange={(event) => chooseCollege(event.target.value)}
                className="field"
              >
                <option value="">Any college</option>
                {academics.colleges
                  .filter((item) => item.is_active || sameId(item.id, form.college_id))
                  .map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField
              label="Program"
              htmlFor="student-program-id"
              optional
              hint={form.college_id ? "The programs of the college chosen." : undefined}
            >
              <select
                id="student-program-id"
                value={form.program_id}
                onChange={(event) => chooseProgram(event.target.value)}
                className="field"
              >
                <option value="">Not in the list (type it below)</option>
                {programs.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.short_code}: {item.name}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        )}
        {form.program_id ? (
          <>
            {majors.length > 0 && (
              <FormField label="Major" htmlFor="student-major" optional>
                <select
                  id="student-major"
                  value={form.major_id}
                  onChange={(event) => chooseMajor(event.target.value)}
                  className="field"
                >
                  <option value="">None</option>
                  {majors.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField
              label="Block"
              htmlFor="student-block"
              optional
              hint={blocks.length === 0 ? "This program has no active block. Add one on the Programs page." : undefined}
            >
              <select
                id="student-block"
                value={form.block_id}
                onChange={(event) => chooseBlock(event.target.value)}
                className="field"
                disabled={blocks.length === 0}
              >
                <option value="">No block</option>
                {blocks.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                    {item.term_name ? ` (${item.term_name})` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        ) : (
          <FormField
            label={academics && academics.programs.length > 0 ? "Program, as text" : "Program"}
            htmlFor="student-program"
            optional
            hint={
              academics && academics.programs.length > 0
                ? "Only for a program that is not in the list above. It cannot be filtered by, or given a major or block."
                : undefined
            }
          >
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
        )}
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
              .filter((item) => item.is_active || sameId(item.supervisor_id, form.supervisor_id))
              .map((item) => (
                <option key={item.supervisor_id} value={item.supervisor_id}>
                  {item.name}
                  {item.company ? ` · ${item.company}` : ""}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Company" htmlFor="student-company" optional>
          <CompanyPicker id="student-company" value={form.company} onChange={set("company")} />
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
