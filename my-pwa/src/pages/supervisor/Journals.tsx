import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import { errorText } from "../../lib/toast";
import type { JournalEntry } from "./useSupervisorWork";
import InternGroupSelect from "./InternGroups";
import { useInternGroups } from "./useInternGroups";

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
      if (!response.ok) throw new Error(data.message || "Could not load the journals.");
      setJournals(data.journals || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the journals."));
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

  const ofIntern = (internId ? journals.filter((item) => item.student_id === internId) : journals).filter(
    (item) => inGroup(item.student_id)
  );
  const count = (status: JournalEntry["status"]) =>
    ofIntern.filter((item) => item.status === status).length;
  const visible = (scope === "all" ? ofIntern : ofIntern.filter((item) => item.status === scope))
    // Newest week first, whatever its state.
    .slice()
    .sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0));

  return (
    <SupervisorLayout
      title="Journals"
      subtitle="What your interns wrote each week, including the ones you have reviewed."
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <FilterChips
              label="Which journals"
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "All", count: ofIntern.length },
                { value: "Submitted", label: "Waiting for you", count: count("Submitted") },
                { value: "Reviewed", label: "Reviewed", count: count("Reviewed") },
                { value: "Returned", label: "Returned", count: count("Returned") },
              ]}
            />
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
              title={journals.length === 0 ? "No journals yet" : "No journals of this kind"}
              description={
                journals.length === 0
                  ? "Your interns write one a week. Each appears here once it is sent."
                  : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((journal) => (
                <li key={journal.id} className="space-y-2.5 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{journal.student_name}</p>
                      <p className="text-xs text-slate-500">
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
                  <Part label="What they did">{journal.activities}</Part>
                  <Part label="What they learned">{journal.learnings}</Part>
                  {journal.challenges && <Part label="Difficulties they met">{journal.challenges}</Part>}
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
        </Card>
      </div>
    </SupervisorLayout>
  );
}

function Part({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-700">{children}</p>
    </div>
  );
}
