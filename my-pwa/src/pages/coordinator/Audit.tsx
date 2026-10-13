import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DateRangeFilter from "../../components/DateRangeFilter";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  SearchField,
  SkeletonRows,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { formatDateTime, localDateKey } from "../../lib/format";
import { errorText, toast, withWorkingToast } from "../../lib/toast";
import { serverPagination } from "../../lib/usePagination";
import FilterBar from "./FilterBar";
import { coordinatorRequest } from "./request";
import { FILTER_KEYS as STUDENT_KEYS, useStudentFilters } from "./useStudentFilters";

/*
|--------------------------------------------------------------------------
| AUDIT LOG
|--------------------------------------------------------------------------
|
| Who did what, newest first. The server writes a row as each action
| happens; this page only reads them, a page at a time.
|
| Every filter is in the page's address, so a filtered view can be
| bookmarked, sent to someone, or come back to with the Back button.
|
*/

type Entry = {
  id: number;
  actor_role: "student" | "supervisor" | "coordinator";
  actor_id: string;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const PAGE_SIZE = 25;

const GROUPS = [
  { value: "", label: "Every category" },
  { value: "attendance", label: "Attendance" },
  { value: "task", label: "Tasks" },
  { value: "document", label: "Documents" },
  { value: "absence", label: "Absences" },
  { value: "account", label: "Accounts" },
  { value: "interns", label: "Reassignments" },
  { value: "company", label: "Companies" },
  { value: "term", label: "Terms" },
  { value: "holiday", label: "Holidays" },
  { value: "journal", label: "Weekly reports" },
  { value: "dtr", label: "Time record certifications" },
  { value: "final_evaluation", label: "Final evaluations" },
  { value: "site_visit", label: "Site visits" },
  { value: "complaint", label: "Concerns" },
  { value: "announcement", label: "Announcements" },
  { value: "requirement", label: "Requirements" },
  { value: "schedule", label: "Schedules" },
  { value: "college", label: "Colleges" },
  { value: "program", label: "Programs" },
  { value: "major", label: "Majors" },
  { value: "block", label: "Blocks" },
  { value: "privacy", label: "Privacy notice and data copies" },
  { value: "student", label: "Student records opened" },
  { value: "audit", label: "Exports of this log" },
] as const;

/** The kinds of record an entry can be about, as the "Record" filter lists them. */
const RECORD_KINDS = [
  { value: "", label: "Any kind of record" },
  { value: "student", label: "Student" },
  { value: "supervisor", label: "Supervisor" },
  { value: "coordinator", label: "Coordinator" },
  { value: "attendance", label: "Attendance log" },
  { value: "task", label: "Task" },
  { value: "team_task", label: "Team task" },
  { value: "document", label: "Document" },
  { value: "upload", label: "Uploaded file" },
  { value: "absence", label: "Absence" },
  { value: "journal", label: "Weekly report" },
  { value: "company", label: "Company" },
  { value: "term", label: "Term" },
  { value: "holiday", label: "Holiday" },
  { value: "complaint", label: "Concern" },
  { value: "announcement", label: "Announcement" },
  { value: "requirement", label: "Requirement" },
  { value: "college", label: "College" },
  { value: "program", label: "Program" },
  { value: "major", label: "Major" },
  { value: "block", label: "Block" },
  { value: "evaluation_form", label: "Evaluation form" },
] as const;

const WHEN = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "term", label: "This term" },
  { value: "custom", label: "Custom dates" },
] as const;

type TermDates = { name: string; start_date: string; end_date: string; is_closed: boolean };

/** The dates a preset stands for. "This week" starts on Monday. */
function presetRange(when: string, term: TermDates | null): { from: string; to: string } | null {
  const now = new Date();
  const today = localDateKey(now);
  if (when === "today") return { from: today, to: today };
  if (when === "week") {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return { from: localDateKey(monday), to: today };
  }
  if (when === "term" && term) {
    return { from: String(term.start_date).slice(0, 10), to: String(term.end_date).slice(0, 10) };
  }
  return null;
}

/** What each recorded action is called on screen. */
const ACTIONS: Record<string, string> = {
  "attendance.approve": "Verified an attendance log",
  "attendance.rejected": "Rejected an attendance log",
  "attendance.undo": "Withdrew a decision on an attendance log",
  "attendance.acknowledge": "Kept a rejection on a flagged log",
  "attendance.correct_times": "Corrected the times on an attendance log",
  "attendance.record_time_in": "Recorded an intern's time-in in person",
  "task.approve": "Marked a task as reviewed",
  "task.needs_revision": "Asked for revisions on a task",
  "task.undo": "Withdrew a task review",
  "task.assign": "Assigned a task",
  "task.edit": "Changed a task",
  "task.cancel": "Cancelled a task",
  "task.team_assign": "Assigned a task to a team",
  "task.team_edit": "Changed a team's task",
  "task.team_cancel": "Cancelled a team's task",
  "evaluation.create": "Wrote an evaluation",
  "evaluation.edit": "Changed an evaluation",
  "evaluation.remove": "Removed an evaluation",
  "document.approve": "Approved a document",
  "document.rejected": "Rejected a document",
  "document.undo": "Withdrew a document review",
  "absence.approve": "Excused an absence",
  "absence.unexcused": "Marked an absence unexcused",
  "absence.undo": "Withdrew a decision on an absence",
  "account.create": "Created an account",
  "account.edit": "Edited an account",
  "account.activate": "Reactivated an account",
  "account.deactivate": "Deactivated an account",
  "account.import": "Imported accounts from a file",
  "account.password_reset": "Reset an account's password",
  "interns.reassign": "Moved interns to another supervisor",
  "term.create": "Added a term",
  "term.edit": "Edited a term",
  "term.add_students": "Added students to a term",
  "term.close": "Closed a term",
  "term.reopen": "Reopened a term",
  "holiday.create": "Added a holiday",
  "holiday.edit": "Edited a holiday",
  "holiday.remove": "Removed a holiday",
  "site_visit.log": "Logged a site visit",
  "site_visit.edit": "Edited a site visit",
  "site_visit.remove": "Removed a site visit",
  "evaluation_form.save": "Changed the final evaluation form",
  "final_evaluation.submit": "Submitted or changed a final evaluation",
  "dtr.certify": "Certified a month of a time record",
  "dtr.withdraw": "Withdrew a time record certification",
  "journal.review": "Reviewed a weekly report",
  "journal.return": "Returned a weekly report",
  "journal.undo": "Withdrew a decision on a weekly report",
  "company.create": "Added a company",
  "company.edit": "Edited a company",
  "company.activate": "Marked a company active",
  "company.deactivate": "Marked a company inactive",
  "complaint.status": "Changed a concern's status",
  "announcement.send": "Sent an announcement",
  "announcement.withdraw": "Withdrew an announcement",
  "requirement.create": "Added a requirement",
  "requirement.edit": "Changed a requirement",
  "schedule.change": "Changed a student's schedule",
  "college.create": "Added a college",
  "college.edit": "Changed a college",
  "program.create": "Added a program",
  "program.edit": "Changed a program",
  "major.create": "Added a major",
  "major.edit": "Changed a major",
  "block.create": "Added a block",
  "block.edit": "Changed a block",
  "block.add_students": "Added students to a block",
  "privacy.consent": "Agreed to the privacy notice",
  "privacy.export": "Downloaded a copy of their own data",
  "student.view": "Opened a student's record",
  "document.view": "Opened a document or uploaded file",
  "audit.export": "Exported the audit log",
};

const ROLE_NAMES = { student: "Student", supervisor: "Supervisor", coordinator: "Coordinator" };

/** Field names from `details`, in plain words. */
const DETAIL_LABELS: Record<string, string> = {
  status: "Status",
  reason: "Reason",
  before: "Before",
  month: "Month",
  visit_date: "Visit date",
  average: "Average rating",
  scale_max: "Top of the scale",
  criteria: "Criteria",
  verified_hours: "Verified hours",
  after: "After",
  review_notes: "Note",
  notes: "Note",
  resolution_notes: "Note",
  name: "Name",
  program: "Program",
  company: "Company",
  department: "Department",
  supervisor_id: "Supervisor",
  required_hours: "Required hours",
  student_id: "Student",
  to: "Moved to",
  title: "Title",
  audience: "Sent to",
  created: "Created",
  failed: "Failed",
  days: "Days",
  start_date: "Starts",
  end_date: "Ends",
  students: "Students",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  moa_start: "Agreement starts",
  moa_expiry: "Agreement ends",
  slots: "Intern places",
  isActive: "Active",
  is_active: "Active",
  short_name: "Short name",
  short_code: "Short code",
  college_id: "College",
  program_id: "Program",
  major_id: "Major",
  term_id: "Term",
  year_level: "Year level",
  section: "Section",
  ojt_applies: "OJT applies",
  block: "Block",
  left_out: "Left out",
  version: "Notice version",
  rows: "Entries",
  filters: "Filters used",
  due_date: "Due",
  release_day: "Shown to the intern on",
  team: "Team",
  members: "Members",
  left_as_is: "Already submitted, left as it is",
  kept: "Already submitted, kept",
  category: "Category",
  rating: "Rating",
};

function describeAction(action: string): string {
  return ACTIONS[action] ?? action.replace(/[._]/g, " ");
}

function detailText(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => {
      const shown = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "boolean"
          ? value
            ? "yes"
            : "no"
          : String(value);
      return `${DETAIL_LABELS[key] ?? key}: ${shown}`;
    })
    .join(" · ");
}

/** The record an entry is about; a student's opens their page. */
function Subject({ entry }: { entry: Entry }) {
  if (!entry.entity_id) return <span className="text-slate-500">None</span>;
  if (entry.entity_type === "student") {
    return (
      <Link
        to={`/coordinator/students/${encodeURIComponent(entry.entity_id)}`}
        className="font-medium text-psu-700 hover:underline"
      >
        Student {entry.entity_id}
      </Link>
    );
  }
  const kind =
    RECORD_KINDS.find((item) => item.value && item.value === entry.entity_type)?.label ??
    (entry.entity_type ? entry.entity_type.replace(/_/g, " ") : "record");
  return (
    <span>
      {kind} {entry.entity_id}
    </span>
  );
}

const selectClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-psu-500 focus:outline-none";

/** A labelled dropdown for one filter. */
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The filter names used in the page's address. */
const FILTER_KEYS = ["category", "role", "person", "kind", "record", "when", "from", "to"] as const;

export default function CoordinatorAudit() {
  // The address is where the filters live; the page reads them from it.
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const role = params.get("role") || "";
  const person = params.get("person") || "";
  const kind = params.get("kind") || "";
  const record = params.get("record") || "";
  const when = params.get("when") || "";
  const customFrom = params.get("from") || "";
  const customTo = params.get("to") || "";
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  // Entries about some of the students. From the address only: a filter
  // left over from another page would hide most of the log without saying so.
  const subject = useStudentFilters({ remember: false });
  // The term "This term" means: the one today falls in, else the newest still open.
  const [term, setTerm] = useState<TermDates | null>(null);

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ terms: TermDates[] }>("/api/coordinator/terms")
      .then((data) => {
        if (!current) return;
        const today = localDateKey(new Date());
        const list = data.terms || [];
        setTerm(
          list.find(
            (item) => String(item.start_date).slice(0, 10) <= today && today <= String(item.end_date).slice(0, 10)
          ) ??
            list.find((item) => !item.is_closed) ??
            null
        );
      })
      // Without the terms the other presets still work.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  /** Changes filters in the address. A changed filter starts again from the first page. */
  const change = useCallback(
    (changes: Record<string, string>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (!("page" in changes)) next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // What is typed is shown at once and put in the address a moment later,
  // so a request is not sent for every letter.
  const [personText, setPersonText] = useState(person);
  const [recordText, setRecordText] = useState(record);
  useEffect(() => {
    if (personText.trim() === person && recordText.trim() === record) return;
    const timer = window.setTimeout(
      () => change({ person: personText.trim(), record: recordText.trim() }),
      300
    );
    return () => window.clearTimeout(timer);
  }, [personText, recordText, person, record, change]);

  // The dates sent to the server: a preset's, or the custom ones.
  const range = useMemo(() => {
    if (when === "custom") {
      // A range typed back to front is not sent.
      const ordered = !customFrom || !customTo || customFrom <= customTo;
      return { from: ordered ? customFrom : "", to: ordered ? customTo : "" };
    }
    return presetRange(when, term) ?? { from: "", to: "" };
  }, [when, customFrom, customTo, term]);

  /** The filters as the server takes them, shared by the list and the export. */
  const query = useMemo(() => {
    const sent = new URLSearchParams();
    if (category) sent.set("action", category);
    if (role) sent.set("actor_role", role);
    if (person) sent.set("person", person);
    if (kind) sent.set("entity_type", kind);
    if (record) sent.set("entity_id", record);
    if (range.from) sent.set("from", range.from);
    if (range.to) sent.set("to", range.to);
    return [sent.toString(), subject.query].filter(Boolean).join("&");
  }, [category, role, person, kind, record, range, subject.query]);

  // "This term" waits for the term's dates before asking.
  const waitingForTerm = when === "term" && !term;

  const load = useCallback(async () => {
    if (waitingForTerm) return;
    try {
      const data = await coordinatorRequest<{ entries: Entry[]; total: number }>(
        `/api/coordinator/audit?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}${query ? `&${query}` : ""}`
      );
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the audit log."));
    } finally {
      setLoading(false);
    }
  }, [page, query, waitingForTerm]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await withWorkingToast("Preparing the file…", () =>
        fetch(`${API_URL}/api/coordinator/audit/export${query ? `?${query}` : ""}`, withCoordinatorAuth())
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "The audit log could not be exported.");
      }
      // Named here: a page on another address than the server cannot read the name the server gave it.
      const name = `internet-audit-log-${localDateKey(new Date())}.csv`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(
        total > 10000
          ? "Exported the newest 10,000 entries. Narrow the dates to get the rest."
          : `Exported ${total} ${total === 1 ? "entry" : "entries"}. The export is recorded in this log.`
      );
      // The export is itself an entry: show it.
      void load();
    } catch (exportError) {
      toast.error(errorText(exportError, "The audit log could not be exported."));
    } finally {
      setExporting(false);
    }
  };

  const pager = serverPagination(entries, total, page, PAGE_SIZE, (next) =>
    change({ page: next > 1 ? String(next) : "" })
  );
  const filtered = [...FILTER_KEYS, ...STUDENT_KEYS].some((key) => params.get(key));

  return (
    <CoordinatorLayout
      title="Audit log"
      subtitle="Who decided, changed or opened what, and when. Entries cannot be edited or removed."
      actions={
        <Button
          variant="secondary"
          icon="download"
          busy={exporting}
          disabled={loading || total === 0}
          onClick={() => void exportCsv()}
        >
          Export CSV
        </Button>
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <FilterBar
          state={subject}
          note={
            subject.active
              ? "Showing only entries about these students: ones on a student's own record, or that name the student. Most entries about a log, task or document do not name one and are left out."
              : "Choose here to see only the entries about some of the students."
          }
        />

        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Choice
                label="Category"
                value={category}
                onChange={(value) => change({ category: value })}
                options={GROUPS}
              />
              <Choice
                label="Done by"
                value={role}
                onChange={(value) => change({ role: value })}
                options={[
                  { value: "", label: "Anyone" },
                  { value: "student", label: "A student" },
                  { value: "supervisor", label: "A supervisor" },
                  { value: "coordinator", label: "A coordinator" },
                ]}
              />
              <div className="min-w-0">
                <span className="mb-1 block text-xs font-medium text-slate-600">Person</span>
                <SearchField
                  value={personText}
                  onChange={setPersonText}
                  label="Person who did it"
                  placeholder="Name or ID"
                  className="w-full"
                />
              </div>
              <Choice
                label="When"
                value={when}
                onChange={(value) => change({ when: value, from: "", to: "" })}
                options={WHEN.map((option) =>
                  option.value === "term"
                    ? { ...option, label: term ? `This term (${term.name})` : "This term", disabled: !term }
                    : option
                )}
              />
              <Choice
                label="Record"
                value={kind}
                onChange={(value) => change({ kind: value })}
                options={RECORD_KINDS}
              />
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-slate-600">Record ID</span>
                <input
                  type="text"
                  value={recordText}
                  maxLength={80}
                  onChange={(event) => setRecordText(event.target.value)}
                  placeholder="For example, a student ID"
                  className="field"
                />
              </label>
              {when === "custom" && (
                <div className="sm:col-span-2 sm:self-end">
                  <DateRangeFilter
                    from={customFrom}
                    to={customTo}
                    onChange={(nextFrom, nextTo) => change({ from: nextFrom, to: nextTo })}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-slate-600">
              <p aria-live="polite">
                {loading
                  ? "Loading…"
                  : `${total} ${total === 1 ? "entry" : "entries"}${
                      range.from || range.to
                        ? `, ${range.from && range.to ? `${range.from} to ${range.to}` : range.from ? `from ${range.from}` : `up to ${range.to}`} (Philippine time)`
                        : ""
                    }`}
              </p>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setPersonText("");
                    setRecordText("");
                    setParams({}, { replace: true });
                  }}
                  className="font-semibold text-psu-700 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={filtered ? "search" : "clipboard"}
              title={filtered ? "No entries match" : "Nothing recorded yet"}
              description={
                filtered
                  ? undefined
                  : "Decisions and changes are listed here from the moment they are made."
              }
            />
          ) : (
            <>
              {/* Small screens: one block per entry */}
              <ul className="divide-y divide-slate-100 lg:hidden">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-slate-900">
                      {describeAction(entry.action)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-700">
                      <Subject entry={entry} />
                    </p>
                    {detailText(entry.details) && (
                      <p className="mt-0.5 break-words text-xs text-slate-600">
                        {detailText(entry.details)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.actor_name || entry.actor_id} ({ROLE_NAMES[entry.actor_role]}) ·{" "}
                      {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">When</th>
                      <th scope="col" className="px-3 py-3 font-medium">Who</th>
                      <th scope="col" className="px-3 py-3 font-medium">Action</th>
                      <th scope="col" className="px-3 py-3 font-medium">On</th>
                      <th scope="col" className="px-5 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="align-top hover:bg-slate-50">
                        <td className="tabular whitespace-nowrap px-5 py-3 text-slate-700">
                          {formatDateTime(entry.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">
                            {entry.actor_name || entry.actor_id}
                          </p>
                          <p className="text-xs text-slate-500">{ROLE_NAMES[entry.actor_role]}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-900">{describeAction(entry.action)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          <Subject entry={entry} />
                        </td>
                        <td className="max-w-xs break-words px-5 py-3 text-xs text-slate-600">
                          {detailText(entry.details) || <span className="text-slate-500">None</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination state={pager} noun="entry" plural="entries" />
            </>
          )}
        </Card>
      </div>
    </CoordinatorLayout>
  );
}
