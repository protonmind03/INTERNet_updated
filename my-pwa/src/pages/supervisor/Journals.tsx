import { SummaryTiles } from "../../components/display";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    const refresh = () => {
      void load();
    };
    refresh();
    // A new or resubmitted journal arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

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
                    <li key={journal.id} id={recordId("journal", journal.id)} className="space-y-2.5 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            Week of {formatDate(journal.week_start)} to{" "}
                            {formatDate(weekEnd(journal.week_start))} · sent{" "}
                            {formatDateTime(journal.submitted_at)}
                          </p>
                        </div>
                        <StatusBadge
                          status={STATE[journal.status].label}
                          tone={STATE[journal.status].tone}
                        />
                      </div>
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
                      {journal.status === "Submitted" && (
                        <Link
                          to="/supervisor/dashboard"
                          className="inline-block text-sm font-semibold text-psu-700 hover:underline"
                        >
                          Decide it in the Review queue
                        </Link>
                      )}
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

