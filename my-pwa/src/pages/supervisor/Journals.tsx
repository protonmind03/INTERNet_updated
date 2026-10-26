import { SummaryTiles } from "../../components/display";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  ErrorNotice,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import EntryPictures from "../../components/EntryPictures";
import InternPanels from "../../components/InternPanels";
import { DailyAccomplishments, ReportParts } from "../../components/WeeklyReport";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import { errorText } from "../../lib/toast";
import { panelsByIntern } from "../../lib/internPanels";
import { useAccount } from "../../lib/session";
import { recordId, useFocusRecord } from "../../lib/useFocusRecord";
import { useSupervisorWork, type JournalEntry } from "./useSupervisorWork";
import InternGroupSelect from "./InternGroups";
import { useInternGroups } from "./useInternGroups";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| WEEKLY JOURNALS (supervisor)
|--------------------------------------------------------------------------
|
| Every journal the supervisor's interns have written, to read back. A
| journal that is waiting is decided in the Review queue; this page is for
| reading, including the ones already reviewed.
|
| sv10-26: a grid first, interns down and the last six weeks across, each
| cell the week's report by its state (or none sent), so a gap shows at
| once; a cell opens that report. Below, each report is one line (the week,
| when it was sent, its state, how it begins) that opens to be read.
|
*/

type Scope = "all" | "Submitted" | "Reviewed" | "Returned";

const STATE: Record<JournalEntry["status"], { label: string; tone: "good" | "waiting" | "bad" }> = {
  Submitted: { label: "Waiting for you", tone: "waiting" },
  Reviewed: { label: "Reviewed", tone: "good" },
  Returned: { label: "Returned to the intern", tone: "bad" },
};

function weekEnd(weekStart: string): Date {
  const end = new Date(`${weekStart}T00:00:00`);
  end.setDate(end.getDate() + 6);
  return end;
}

export default function SupervisorJournals() {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  // The interns' logs, for what each wrote at time-out during a report's week.
  const supervisor = useAccount("supervisor");
  const { attendance } = useSupervisorWork(supervisor?.supervisor_id, ["attendance"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [internId, setInternId] = useState("");
  // Interns of more than one program or block can be narrowed to one.
  const grouping = useInternGroups();
  const inGroup = grouping.has;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/journals/supervisor`, withSupervisorAuth());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load the weekly reports.");
      setJournals(data.journals || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the weekly reports."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = () => {
      void load();
    };
    first();
  }, [load]);
  // A new or resubmitted journal arrives as a live notification; the rest as everywhere (lib/liveRefresh.ts).
  useLiveRefresh(() => {
    void load();
  }, 60_000);
  // The reports opened to be read: any opened by hand, or from the grid.
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  // Waiting reports start open; one the supervisor closes stays closed.
  const [closedByHand, setClosedByHand] = useState<Set<number>>(() => new Set());
  const toggle = (id: number, open: boolean) =>
    setOpened((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const openReport = (journal: JournalEntry) => {
    setScope("all");
    toggle(journal.id, true);
    window.setTimeout(() => document.getElementById(recordId("journal", journal.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const interns = useMemo(() => {
    const byId = new Map(journals.map((item) => [item.student_id, item.student_name]));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [journals]);

  const ofIntern = (internId ? journals.filter((item) => sameId(item.student_id, internId)) : journals).filter(
    (item) => inGroup(item.student_id)
  );
  const count = (status: JournalEntry["status"]) =>
    ofIntern.filter((item) => item.status === status).length;
  const visible = (scope === "all" ? ofIntern : ofIntern.filter((item) => item.status === scope))
    // Newest week first, whatever its state.
    .slice()
    .sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0));

  // One panel per intern; a notification about one report opens its intern's panel.
  const focus = useFocusRecord(!loading);
  const focusedReport = focus?.startsWith("journal-") ? journals.find((item) => String(item.id) === focus.slice(8)) : undefined;
  const panels = panelsByIntern(visible, {
    student: (item) => ({ id: item.student_id, name: item.student_name }),
    waitingSince: (item) => (item.status === "Submitted" ? item.submitted_at : null),
    block: grouping.blockOf,
  });

  return (
    <SupervisorLayout
      title="Weekly reports"
      subtitle="What your interns wrote each week, including the ones you have reviewed."
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="w-full">
              <SummaryTiles
                label="Which weekly reports"
                value={scope}
                onChange={setScope}
                tiles={[
                  { value: "all", label: "All", count: ofIntern.length, icon: "list", tone: "brand" },
                  { value: "Submitted", label: "Waiting for you", count: count("Submitted"), icon: "inbox", tone: (count("Submitted")) > 0 ? "warning" : "neutral" },
                  { value: "Reviewed", label: "Reviewed", count: count("Reviewed"), icon: "check-circle", tone: "success" },
                  { value: "Returned", label: "Returned", count: count("Returned"), icon: "refresh", tone: (count("Returned")) > 0 ? "danger" : "neutral" },
                ]}
              />
            </div>
          </div>
          <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
          {interns.length > 1 && (
            <label className="block w-full sm:w-56">
              <span className="sr-only">Intern</span>
              <select
                value={internId}
                onChange={(event) => setInternId(event.target.value)}
                className="field"
              >
                <option value="">All interns</option>
                {interns.filter(([id]) => inGroup(id)).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!loading && journals.length > 0 && (
          <WeekGrid journals={ofIntern} interns={interns.filter(([id]) => inGroup(id) && (!internId || sameId(id, internId)))} onOpen={openReport} />
        )}

        <Card>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="note"
              title={journals.length === 0 ? "No weekly reports yet" : "No weekly reports of this kind"}
              description={
                journals.length === 0
                  ? "Your interns write one a week. Each appears here once it is sent."
                  : undefined
              }
            />
          ) : (
            <InternPanels
              panels={panels}
              waitingLabel="waiting"
              focusStudentId={focusedReport?.student_id}
              renderItems={(items) => (
                <ul className="divide-y divide-slate-100">
                  {items.map((journal) => (
                    <li key={journal.id} id={recordId("journal", journal.id)}>
                      <details
                        className="group"
                        // One waiting for the supervisor starts open, to be read; the rest start as one line.
                        open={opened.has(journal.id) || focusedReport?.id === journal.id || (journal.status === "Submitted" && !closedByHand.has(journal.id))}
                        onToggle={(event) => {
                          const open = (event.currentTarget as HTMLDetailsElement).open;
                          toggle(journal.id, open);
                          if (!open && journal.status === "Submitted") setClosedByHand((current) => (current.has(journal.id) ? current : new Set(current).add(journal.id)));
                        }}
                      >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-slate-50 sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="att-date" aria-hidden="true">
                          <b>{formatPhDay(String(journal.week_start).slice(0, 10), { day: "numeric" })}</b>
                          <i>{formatPhDay(String(journal.week_start).slice(0, 10), { month: "short" })}</i>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">
                            Week of {formatDate(journal.week_start)} to {formatDate(weekEnd(journal.week_start))}
                          </span>
                          <span className="block truncate text-[13px] text-slate-600">
                            Sent {formatDateTime(journal.submitted_at)} · {journal.activities}
                          </span>
                        </span>
                        <StatusBadge status={STATE[journal.status].label} tone={STATE[journal.status].tone} />
                        {journal.status === "Submitted" && (
                          <Link
                            to={`/supervisor/dashboard?focus=journal-${journal.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex min-h-9 items-center rounded-lg bg-psu-600 px-3 text-[13px] font-bold text-white hover:bg-psu-700"
                          >
                            Review now
                          </Link>
                        )}
                        <Icon name="chevron-down" size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
                      <ReportParts report={journal} />
                      <EntryPictures role="supervisor" owner="journal" ownerId={journal.id} count={journal.pictures} className="" />
                      <DailyAccomplishments
                        weekStart={journal.week_start}
                        logs={attendance.filter((log) => sameId(log.student_id, journal.student_id))}
                      />
                      {journal.review_notes && (
                        <p className="rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700">
                          <span className="font-semibold">
                            {journal.status === "Submitted" ? "You asked earlier:" : "Your note:"}
                          </span>{" "}
                          {journal.review_notes}
                        </p>
                      )}
                      </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            />
          )}
        </Card>
      </div>
    </SupervisorLayout>
  );
}


const CELL: Record<JournalEntry["status"] | "none" | "ahead", { cls: string; word: string }> = {
  Submitted: { cls: "bg-amber-100 text-amber-900 ring-amber-300", word: "Waiting" },
  Reviewed: { cls: "bg-psu-600 text-white ring-psu-600", word: "Reviewed" },
  Returned: { cls: "bg-red-100 text-red-800 ring-red-300", word: "Returned" },
  none: { cls: "bg-white text-slate-400 ring-slate-200", word: "None sent" },
  ahead: { cls: "bg-transparent text-slate-400 ring-transparent", word: "" },
};

/** Interns down, the last six weeks across: each week's report by its state, or the gap. */
function WeekGrid({ journals, interns, onOpen }: { journals: JournalEntry[]; interns: [string, string][]; onOpen: (journal: JournalEntry) => void }) {
  const today = phToday();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const thisMonday = phAddDays(today, weekday === 0 ? -6 : 1 - weekday);
  const weeks = [5, 4, 3, 2, 1, 0].map((back) => phAddDays(thisMonday, -7 * back));
  if (interns.length === 0) return null;
  return (
    <section aria-labelledby="report-grid-title" className="overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 id="report-grid-title" className="text-[15px] font-bold text-slate-900">
          The last six weeks
        </h2>
        <ul className="ml-auto flex flex-wrap gap-3 text-[12px] text-slate-600" aria-label="Key">
          {(["Reviewed", "Submitted", "Returned", "none"] as const).map((state) => (
            <li key={state} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-inset ${CELL[state].cls}`} aria-hidden="true" />
              {CELL[state].word}
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <colgroup>
            <col className="w-56" />
            {weeks.map((week) => (
              <col key={week} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-xs text-slate-500">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Intern
              </th>
              {weeks.map((week) => (
                <th key={week} scope="col" className="px-1 py-2 text-center font-medium">
                  {week === thisMonday ? "This week" : formatPhDay(week, { month: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {interns.map(([id, name]) => (
              <tr key={id}>
                <th scope="row" className="truncate px-4 py-1.5 text-left font-semibold text-slate-900">
                  {name}
                </th>
                {weeks.map((week) => {
                  const report = journals.find((item) => sameId(item.student_id, id) && String(item.week_start).slice(0, 10) === week);
                  const state = report ? report.status : week === thisMonday ? "ahead" : "none";
                  return (
                    <td key={week} className="px-1 py-1.5">
                      {report ? (
                        <button
                          type="button"
                          onClick={() => onOpen(report)}
                          className={`report-cell ring-1 ring-inset ${CELL[state].cls}`}
                          aria-label={`${name}, week of ${formatPhDay(week, { month: "long", day: "numeric" })}: ${CELL[state].word}`}
                        >
                          {CELL[state].word}
                        </button>
                      ) : (
                        <span className={`report-cell ring-1 ring-inset ${CELL[state].cls}`}>{state === "ahead" ? "Due Sun" : "—"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
