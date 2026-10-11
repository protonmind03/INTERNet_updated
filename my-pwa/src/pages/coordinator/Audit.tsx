import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DateRangeFilter from "../../components/DateRangeFilter";
import Pagination from "../../components/Pagination";
import {
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  SearchField,
  SkeletonRows,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDateTime } from "../../lib/format";
import { errorText } from "../../lib/toast";
import { serverPagination } from "../../lib/usePagination";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| AUDIT LOG
|--------------------------------------------------------------------------
|
| Who did what, newest first. The server writes a row as each action
| happens; this page only reads them, a page at a time.
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
  { value: "", label: "Everything" },
  { value: "attendance", label: "Attendance" },
  { value: "task", label: "Tasks" },
  { value: "document", label: "Documents" },
  { value: "absence", label: "Absences" },
  { value: "account", label: "Accounts" },
  { value: "interns", label: "Reassignments" },
  { value: "company", label: "Companies" },
  { value: "term", label: "Terms" },
  { value: "holiday", label: "Holidays" },
  { value: "journal", label: "Journals" },
  { value: "dtr", label: "Time record certifications" },
  { value: "final_evaluation", label: "Final evaluations" },
  { value: "complaint", label: "Complaints" },
  { value: "announcement", label: "Announcements" },
  { value: "requirement", label: "Requirements" },
  { value: "schedule", label: "Schedules" },
] as const;

type Group = (typeof GROUPS)[number]["value"];

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
  "evaluation_form.save": "Changed the final evaluation form",
  "final_evaluation.submit": "Submitted or changed a final evaluation",
  "dtr.certify": "Certified a month of a time record",
  "dtr.withdraw": "Withdrew a time record certification",
  "journal.review": "Reviewed a weekly journal",
  "journal.return": "Returned a weekly journal",
  "journal.undo": "Withdrew a journal decision",
  "company.create": "Added a company",
  "company.edit": "Edited a company",
  "company.activate": "Marked a company active",
  "company.deactivate": "Marked a company inactive",
  "complaint.status": "Changed a complaint's status",
  "announcement.send": "Sent an announcement",
  "announcement.withdraw": "Withdrew an announcement",
  "requirement.create": "Added a requirement",
  "requirement.edit": "Changed a requirement",
  "schedule.change": "Changed a student's schedule",
};

const ROLE_NAMES = { student: "Student", supervisor: "Supervisor", coordinator: "Coordinator" };

/** Field names from `details`, in plain words. */
const DETAIL_LABELS: Record<string, string> = {
  status: "Status",
  reason: "Reason",
  before: "Before",
  month: "Month",
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
  if (!entry.entity_id) return <span className="text-slate-400">None</span>;
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
  const kind = entry.entity_type ? entry.entity_type.replace(/_/g, " ") : "record";
  return (
    <span>
      <span className="capitalize">{kind}</span> {entry.entity_id}
    </span>
  );
}

export default function CoordinatorAudit() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState<Group>("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (group) params.set("action", group);
    if (query.trim()) params.set("q", query.trim());
    // A range typed back to front is not sent.
    if (from && (!to || from <= to)) params.set("from", from);
    if (to && (!from || from <= to)) params.set("to", to);
    try {
      const data = await coordinatorRequest<{ entries: Entry[]; total: number }>(
        `/api/coordinator/audit?${params.toString()}`
      );
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the audit log."));
    } finally {
      setLoading(false);
    }
  }, [page, group, query, from, to]);

  useEffect(() => {
    // Typing in the search box should not send a request per letter.
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  // A changed filter starts again from the first page.
  const filterBy = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const pager = serverPagination(entries, total, page, PAGE_SIZE, setPage);
  const filtered = Boolean(group || query.trim() || from || to);

  return (
    <CoordinatorLayout
      title="Audit log"
      subtitle="Who decided or changed what, and when. Entries cannot be edited or removed."
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <SearchField
                value={query}
                onChange={filterBy(setQuery)}
                label="Search the audit log"
                placeholder="Search by person or record ID"
                className="w-full sm:w-80"
              />
              <DateRangeFilter
                from={from}
                to={to}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom);
                  setTo(nextTo);
                  setPage(1);
                }}
              />
            </div>
            <FilterChips
              label="Kind of action"
              value={group}
              onChange={filterBy(setGroup)}
              options={GROUPS}
            />
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
                          {detailText(entry.details) || <span className="text-slate-400">None</span>}
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
