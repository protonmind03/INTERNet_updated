import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UnderlineTabs } from "../../brand/motifs";
import UnlessInMenu from "../../components/UnlessInMenu";
import Icon, { type IconName } from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, Modal, SkeletonRows } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatDate, formatHours, greetingFor, firstNameOf } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useFocus } from "../../lib/useFocusRecord";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useProjections } from "../../lib/useProjections";
import { sameId } from "../../lib/ids";
import { finalEvaluationPath, useEvaluatedIds, useFinalDue } from "./finalDue";
import FinalEvaluations from "./FinalEvaluations";
import RecordTimeIn from "./RecordTimeIn";
import ReviewDetail from "./ReviewDetail";
import { awaitsReview, bulkSkipReason } from "./attendanceView";
import InternGroupSelect from "./InternGroups";
import { useInternGroups } from "./useInternGroups";
import { DayBoard, DecidedRow, DecisionCard, RegisterCard, RegisterSkeleton, ThisWeek, type ReviewItem } from "./ReviewParts";
import { todaysLogs } from "./reviewData";
import { useSupervisorWork, type QueueItem } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| REVIEW (PSU redesign 10: S1 on phones, S6 and S7 on tablets and computers)
|--------------------------------------------------------------------------
|
| The supervisor's logbook. Phones: today's register, underlined tabs (All,
| Time-ins, Tasks, Docs), one card per decision with a solid main action and
| an outlined choice ("Reject" asks photo or day in one menu), today's
| decided time-ins with the grey Verified stamp, and a sticky bar to verify
| the ordinary time-ins together. A time-in recorded offline is never in
| that bar: it is confirmed on its own. Computers add the day board, This
| week and plain fact cards. Every decision is the same call as before
| (useSupervisorWork): version checks, undo and the rules are unchanged.
|
*/

type Tab = "all" | "time-ins" | "tasks" | "docs" | "absences" | "reports" | "final";

/** Each tab as the side menu names it, for the line shown in place of the tabs. */
const MENU_NAME: Record<Tab, string> = {
  all: "Everything",
  "time-ins": "Time-ins",
  tasks: "Submitted tasks",
  docs: "Submitted documents",
  absences: "Absences",
  reports: "Submitted reports",
  final: "Final evaluations",
};

const TAB_KINDS: Record<Tab, ReviewItem["kind"][] | null> = {
  all: null,
  "time-ins": ["attendance"],
  tasks: ["task"],
  docs: ["document"],
  absences: ["absence"],
  reports: ["journal"],
  final: ["final"],
};

/** The kinds that can be decided several at a time. */
type BulkKind = "attendance" | "document" | "absence";

const BULK: Record<BulkKind, { title: (count: number) => string; message: string; confirm: string; done: (count: number) => string }> = {
  attendance: {
    title: (count) => `Verify ${count} ordinary time-ins?`,
    message: "Every pending log that has a time-out will be marked verified. Time-ins recorded offline stay for you to confirm one by one.",
    confirm: "Verify all",
    done: (count) => `${count} attendance ${count === 1 ? "log" : "logs"} verified.`,
  },
  document: {
    title: (count) => `Approve ${count} documents?`,
    message: "Every document waiting for you will be marked approved. Review one you want to reject by itself first.",
    confirm: "Approve all",
    done: (count) => `${count} ${count === 1 ? "document" : "documents"} approved.`,
  },
  absence: {
    title: (count) => `Excuse ${count} absences?`,
    message: "Every absence waiting for you will be marked excused. Review one you do not accept by itself first.",
    confirm: "Excuse all",
    done: (count) => `${count} ${count === 1 ? "absence" : "absences"} excused.`,
  },
};

/** Where a decided item of each kind can still be seen, with ?focus= on it. */
const DECIDED_PAGE: Record<string, string> = {
  attendance: "/supervisor/attendance",
  absence: "/supervisor/attendance",
  document: "/supervisor/documents",
  journal: "/supervisor/journals",
};

/**
| "To verify" in sections (sv10-26): the full queue is listed kind by kind,
| each under its own heading with its count and, where several can be
| decided together, that one action. Time-ins come first: they are the
| day's and they hold hours back.
*/
const KIND_SECTIONS: { kind: QueueItem["kind"]; label: string; icon: IconName; bulk?: BulkKind }[] = [
  { kind: "attendance", label: "Time-ins", icon: "camera", bulk: "attendance" },
  { kind: "absence", label: "Absences", icon: "calendar", bulk: "absence" },
  { kind: "task", label: "Submitted tasks", icon: "tasks" },
  { kind: "document", label: "Submitted documents", icon: "document", bulk: "document" },
  { kind: "journal", label: "Weekly reports", icon: "note" },
];

/** How long an item stays marked "New" after it arrived on screen. */
const NEW_FOR_MS = 3 * 60_000;

/** How long an item has been waiting, in plain words. */
function waitingText(since: string | undefined): string {
  const then = since ? new Date(since).getTime() : NaN;
  if (Number.isNaN(then)) return "";
  const hours = Math.round((Date.now() - then) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "From yesterday" : `${days} days old`;
}

export default function SupervisorDashboard() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  useLaunchReady(!work.loading);
  const { interns, loading } = work;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const finalDue = useFinalDue(interns);
  const evaluated = useEvaluatedIds();
  const projections = useProjections("supervisor");
  const queue = useMemo<ReviewItem[]>(() => [...work.queue, ...finalDue], [work.queue, finalDue]);
  const computer = useMediaQuery("(min-width: 1024px)");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // What arrived while the page was open is marked "New" for a few minutes (sv10-26). The first
  // list seen is the baseline; each later one adds the keys it brings, with when they came.
  const queueKeys = queue.map((item) => item.key).join("|");
  const [arrivals, setArrivals] = useState<{ signature: string; known: Set<string>; since: Map<string, number> } | null>(null);
  if (!loading && arrivals?.signature !== queueKeys) {
    const keys = queue.map((item) => item.key);
    if (!arrivals) {
      setArrivals({ signature: queueKeys, known: new Set(keys), since: new Map() });
    } else {
      const since = new Map(arrivals.since);
      for (const key of keys) if (!arrivals.known.has(key)) since.set(key, now.getTime());
      setArrivals({ signature: queueKeys, known: new Set([...arrivals.known, ...keys]), since });
    }
  }
  const isNew = (key: string) => {
    const at = arrivals?.since.get(key);
    return at !== undefined && now.getTime() - at < NEW_FOR_MS;
  };

  // The tab is in the address (?tab=), the one place it is kept, so the
  // side menu marks the same entry and Back returns to it.
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && asked in TAB_KINDS ? asked : "all";
  const [internId, setInternId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const grouping = useInternGroups();
  const inGroup = grouping.has;

  // A notification about one item opens it (its key is "task-12"); one decided since opens on its own page.
  const focus = useFocus();
  const [selectedKey, setSelectedKey] = useState<string | null>(focus);
  const forwarded = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !focus || forwarded.current === focus || queue.some((item) => item.key === focus)) return;
    forwarded.current = focus;
    const kind = focus.slice(0, focus.indexOf("-"));
    const page = DECIDED_PAGE[kind];
    if (page) {
      navigate(`${page}?focus=${focus}`, { replace: true });
      toast.info("That one is already decided. Here it is with the rest.");
    } else {
      navigate("/supervisor/dashboard", { replace: true });
      toast.info("That one is no longer waiting for you.");
    }
  }, [loading, focus, queue, navigate]);

  const [confirmBulk, setConfirmBulk] = useState<BulkKind | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const scoped = useMemo(
    () => (internId ? queue.filter((item) => sameId(item.entry.student_id, internId)) : queue).filter((item) => inGroup(item.entry.student_id)),
    [queue, internId, inGroup]
  );
  const countOf = (which: Tab) => (TAB_KINDS[which] ? scoped.filter((item) => TAB_KINDS[which]!.includes(item.kind)).length : scoped.length);
  const visible = TAB_KINDS[tab] ? scoped.filter((item) => TAB_KINDS[tab]!.includes(item.kind)) : scoped;
  const selected = queue.find((item) => item.key === selectedKey);

  const verifiable = useMemo(
    () =>
      scoped.filter(
        (item): item is Extract<QueueItem, { kind: "attendance" }> =>
          item.kind === "attendance" && awaitsReview(item.entry) && bulkSkipReason(item.entry) === null
      ),
    [scoped]
  );
  const waitingDocuments = scoped.filter((item): item is Extract<QueueItem, { kind: "document" }> => item.kind === "document");
  const waitingAbsences = scoped.filter((item): item is Extract<QueueItem, { kind: "absence" }> => item.kind === "absence");
  const bulkRows: { key: string; name: string; what: string; id: number }[] =
    confirmBulk === "attendance"
      ? verifiable.map((item) => ({ key: item.key, id: item.entry.id, name: item.entry.student_name, what: `${formatDate(item.entry.date)} · ${formatHours(item.entry.hours)}` }))
      : confirmBulk === "document"
        ? waitingDocuments.map((item) => ({ key: item.key, id: item.entry.id, name: item.entry.student_name, what: item.entry.doc_type }))
        : confirmBulk === "absence"
          ? waitingAbsences.map((item) => ({ key: item.key, id: item.entry.id, name: item.entry.student_name, what: formatDate(item.entry.date) }))
          : [];

  const decideAll = async () => {
    if (!confirmBulk) return;
    const kind = confirmBulk;
    const ids = bulkRows.map((row) => row.id);
    setBulkBusy(true);
    try {
      const { done, failure } = kind === "attendance" ? await work.verifyMany(ids) : await work.decideMany(kind, ids);
      if (failure) toast.error(`${done} of ${ids.length} saved, then it stopped: ${failure}`);
      else toast.success(BULK[kind].done(done));
    } catch (error) {
      toast.error(errorText(error, "They could not be saved."));
    } finally {
      setBulkBusy(false);
      setConfirmBulk(null);
    }
  };

  /** The card's solid action: verify an ordinary log, or confirm an offline time-in on its own. */
  const verifyOne = async (item: Extract<QueueItem, { kind: "attendance" }>) => {
    const entry = item.entry;
    setBusyKey(item.key);
    try {
      await work.decideAttendance(entry.id, "Verified", undefined, entry.status, entry.offline_time_in);
      toast.success(`${entry.student_name}'s log for ${formatDate(entry.date)} verified.`, {
        label: "Undo",
        onClick: () => {
          work
            .decideAttendance(entry.id, "Pending", undefined, "Verified")
            .then(() => toast.info("Decision withdrawn. The log is back in your queue."))
            .catch((error: unknown) => toast.error(errorText(error, "The decision could not be undone.")));
        },
      });
    } catch (error) {
      toast.error(errorText(error, "The log could not be verified."));
    } finally {
      setBusyKey(null);
    }
  };

  const pickTab = (next: Tab) => {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("tab");
    else copy.set("tab", next);
    setParams(copy, { replace: true });
  };

  const logs = todaysLogs(work);
  const today = phToday();
  const decidedToday = work.attendance
    .filter((entry) => (entry.status === "Verified" || entry.status === "Rejected") && entry.verified_at && String(entry.verified_at).slice(0, 10) === today)
    .slice(0, 4);
  const shownInterns = interns.filter((intern) => inGroup(intern.student_id));
  const firstName = firstNameOf(supervisor?.name);
  const company = supervisor?.company || "your company";
  const oldest = queue.filter((item): item is QueueItem => item.kind !== "final").map((item) => item.waitingSince).sort()[0];
  const tabs = [
    { value: "all" as Tab, label: "All", count: countOf("all") },
    { value: "time-ins" as Tab, label: "Time-ins", count: countOf("time-ins") },
    { value: "tasks" as Tab, label: "Tasks", count: countOf("tasks") },
    { value: "docs" as Tab, label: "Docs", count: countOf("docs") },
    ...(countOf("absences") > 0 || tab === "absences" ? [{ value: "absences" as Tab, label: "Absences", count: countOf("absences") }] : []),
    ...(countOf("reports") > 0 || tab === "reports" ? [{ value: "reports" as Tab, label: "Reports", count: countOf("reports") }] : []),
    ...(countOf("final") > 0 || tab === "final" ? [{ value: "final" as Tab, label: "Final evaluations", count: countOf("final") }] : []),
  ];

  /** One waiting item: a decision card, or a final evaluation to start. Marked while it is new. */
  const renderItem = (item: ReviewItem, grouped = false) => (
    <div key={item.key} className={isNew(item.key) ? "review-new relative" : "relative"} data-new={isNew(item.key) || undefined}>
      {isNew(item.key) && (
        <span className="review-new-pill pointer-events-none absolute right-3 top-1 z-[1]" aria-label="New">
          New
        </span>
      )}
      {item.kind === "final" ? (
        <div className={computer ? "flex items-center justify-between gap-3 px-4 py-3" : "card-hairline flex items-center justify-between gap-3 rounded-2xl p-3.5"}>
          <span className="min-w-0">
            <span className="eyebrow block text-slate-600">Final evaluation</span>
            <span className="block truncate text-[15px] font-bold text-slate-900">{item.entry.student_name}</span>
            <span className="block text-[13px] text-slate-600">
              {formatHours(item.entry.hours_rendered)} of {formatHours(item.entry.required_hours)}
            </span>
          </span>
          <Link to={finalEvaluationPath(item.entry.student_id)} className="inline-flex min-h-11 items-center rounded-lg bg-psu-600 px-4 text-sm font-bold text-white hover:bg-psu-700">
            Start
          </Link>
        </div>
      ) : (
        <DecisionCard
          item={item}
          layout={computer ? "row" : "card"}
          grouped={grouped}
          busy={busyKey === item.key}
          onVerify={() => item.kind === "attendance" && void verifyOne(item)}
          onOpen={() => setSelectedKey(item.key)}
          onRejectChoice={() => setSelectedKey(item.key)}
        />
      )}
    </div>
  );

  const list = (
    <>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="check-circle"
            title={queue.length === 0 ? "You're all caught up" : "Nothing of this kind"}
            description={queue.length === 0 ? "New time-ins, tasks, documents and absences appear here." : undefined}
          />
        </Card>
      ) : (
        tab === "all" ? (
          // The whole queue, kind by kind, each under its heading.
          <div className={computer ? "" : "space-y-5"}>
            {[...KIND_SECTIONS, { kind: "final" as const, label: "Final evaluations due", icon: "star" as IconName, bulk: undefined }].map((section) => {
              const items = visible.filter((item) => item.kind === section.kind);
              if (items.length === 0) return null;
              const bulkCount =
                section.bulk === "attendance" ? verifiable.length : section.bulk === "document" ? waitingDocuments.length : section.bulk === "absence" ? waitingAbsences.length : 0;
              const fresh = items.filter((item) => isNew(item.key)).length;
              return (
                <section key={section.kind} aria-label={`${section.label}, ${items.length}`} className="review-section">
                  <div className={`flex flex-wrap items-center gap-2.5 ${computer ? "sticky top-[calc(var(--inb-top-inset)+4rem)] z-[5] border-y border-(--role-hairline) bg-slate-50/95 px-4 py-2 backdrop-blur" : "px-1 pb-2"}`}>
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-psu-700 ring-1 ring-inset ring-(--role-hairline)">
                      <Icon name={section.icon} size={15} />
                    </span>
                    <h3 className="text-[14.5px] font-bold text-slate-900">{section.label}</h3>
                    <span className="tabular rounded-full bg-psu-700 px-2 text-[12px] font-bold leading-5 text-white">{items.length}</span>
                    {fresh > 0 && <span className="review-new-pill">{fresh} new</span>}
                    {section.bulk && section.bulk !== "attendance" && bulkCount > 1 && (
                      <button type="button" onClick={() => setConfirmBulk(section.bulk!)} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-psu-700 hover:bg-psu-50">
                        <Icon name="check-circle" size={15} />
                        {section.bulk === "document" ? `Approve all ${bulkCount}` : `Excuse all ${bulkCount}`}
                      </button>
                    )}
                  </div>
                  <div className={computer ? "divide-y divide-(--role-hairline)" : "space-y-3"}>{items.map((item) => renderItem(item, true))}</div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={computer ? "divide-y divide-(--role-hairline)" : "space-y-3"}>{visible.map((item) => renderItem(item))}</div>
        )
      )}
      {decidedToday.length > 0 && tab !== "tasks" && tab !== "docs" && (
        <div className={computer ? "border-t border-(--role-hairline)" : "card-hairline mt-3 overflow-hidden rounded-2xl"}>
          <h3 className="sr-only">Decided today</h3>
          <div className="divide-y divide-(--role-hairline)">
            {decidedToday.map((entry) => (
              <DecidedRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <SupervisorLayout
      title={computer ? `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ""}` : "Review"}
      subtitle={
        computer
          ? `${formatPhDay(today, { weekday: "long", month: "short", day: "numeric" })} · ${[supervisor?.department, supervisor?.company].filter(Boolean).join(", ")}`
          : `${supervisor?.company ?? ""}${interns.length ? ` · ${interns.length} ${interns.length === 1 ? "intern" : "interns"}` : ""}`
      }
      actions={
        computer && tab !== "final" && (loading || interns.length > 0) ? (
          <Button variant="secondary" icon="camera" disabled={loading} onClick={() => setRecording(true)}>
            Record time-in
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        {computer ? (
          // The day as a whole on the full queue; a chosen kind (Absences, Submitted tasks…) opens straight on its list.
          tab === "all" && !loading && shownInterns.length > 0 && <DayBoard company={company} interns={shownInterns} logs={logs} now={now} />
        ) : (
          loading ? <RegisterSkeleton /> : shownInterns.length > 0 && <RegisterCard interns={shownInterns} logs={logs} />
        )}

        {tab === "final" ? (
          // Final evaluations: every intern and where theirs stands, not a queue to clear.
          <FinalEvaluations interns={shownInterns} evaluated={evaluated} loading={loading} />
        ) : (
        <div className={computer ? "grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}>
          <section aria-labelledby="to-verify-title" className={computer ? "overflow-hidden rounded-2xl border-2 border-psu-600/40 bg-white" : ""}>
            {computer && (
              <div className="flex flex-wrap items-center gap-3 border-b border-(--role-hairline) bg-psu-50/40 px-4 py-3">
                <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-psu-700 px-2 font-display text-[18px] font-extrabold text-white tabular">{scoped.length}</span>
                <h2 id="to-verify-title" className="font-display text-[22px] font-extrabold text-slate-900">
                  To verify
                </h2>
                {oldest && <span className="text-[13.5px] text-slate-600">Oldest {waitingText(oldest).toLowerCase()}</span>}
                <LiveLine updatedAt={work.updatedAt} now={now} />
                {verifiable.length > 0 && (tab === "all" || tab === "time-ins") ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Button onClick={() => setConfirmBulk("attendance")}>Verify all {verifiable.length}</Button>
                    <InfoTip label="About Verify all" text="Verifies the ordinary time-ins that have a time-out. Time-ins recorded offline stay for you to confirm one by one." />
                  </span>
                ) : tab === "docs" && waitingDocuments.length > 1 ? (
                  <Button className="ml-auto" icon="check-circle" onClick={() => setConfirmBulk("document")}>
                    Approve all {waitingDocuments.length}
                  </Button>
                ) : tab === "absences" && waitingAbsences.length > 1 ? (
                  <Button className="ml-auto" icon="check-circle" onClick={() => setConfirmBulk("absence")}>
                    Excuse all {waitingAbsences.length}
                  </Button>
                ) : null}
              </div>
            )}
            {!computer && (
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <LiveLine updatedAt={work.updatedAt} now={now} />
              </div>
            )}
            {!computer && <h2 id="to-verify-title" className="sr-only">To verify</h2>}
            <div className={computer ? "px-4 pt-2" : "mb-3"}>
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  {/* The side menu lists these when it is open (components/sideMenuState.ts). */}
                  <UnlessInMenu
                    instead={
                      tab !== "all" && (
                        <p className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                          Showing <b className="text-slate-900">{MENU_NAME[tab]}</b>
                          <button type="button" onClick={() => pickTab("all")} className="inline-flex min-h-11 items-center font-bold text-psu-700 hover:underline">
                            Show all
                          </button>
                        </p>
                      )
                    }
                  >
                    <UnderlineTabs label="Show" tabs={tabs} value={tab} onChange={pickTab} />
                  </UnlessInMenu>
                </div>
                <button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} className="mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  <Icon name="filter" size={16} />
                  Filter
                </button>
              </div>
              {showFilters && (
                <div className="flex flex-wrap items-center gap-3 py-3">
                  <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
                  {interns.length > 1 && (
                    <label className="block w-full sm:w-56">
                      <span className="sr-only">Intern</span>
                      <select value={internId} onChange={(event) => setInternId(event.target.value)} className="field">
                        <option value="">All interns</option>
                        {shownInterns.map((intern) => (
                          <option key={intern.student_id} value={intern.student_id}>
                            {intern.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {/* Phones: the bulk choices for documents and absences (computers have them on each section). */}
                  {!computer && waitingDocuments.length > 1 && (
                    <Button variant="secondary" icon="check-circle" onClick={() => setConfirmBulk("document")}>
                      Approve {waitingDocuments.length} documents
                    </Button>
                  )}
                  {!computer && waitingAbsences.length > 1 && (
                    <Button variant="secondary" icon="check-circle" onClick={() => setConfirmBulk("absence")}>
                      Excuse {waitingAbsences.length} absences
                    </Button>
                  )}
                </div>
              )}
            </div>
            {list}
          </section>
          {computer && <ThisWeek work={work} finalDue={finalDue} projections={projections} />}
        </div>
        )}

        {!loading && interns.length === 0 && !work.error && (
          <p className="text-sm text-slate-600">No interns are assigned to you yet. Your OJT coordinator assigns interns to supervisors.</p>
        )}
      </div>

      {/* Phones and tablets: verify the ordinary time-ins together, above the dock. */}
      {!computer && verifiable.length > 0 && (
        <div className="sticky bottom-[calc(var(--inb-bottom-bar)+0.75rem)] z-20 mt-4">
          <div className="card-hairline flex items-center gap-3 rounded-2xl px-4 py-3 shadow-raised">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-slate-900">Verify the {verifiable.length} ordinary time-ins</span>
              <span className="block text-[13px] text-slate-600">Offline ones stay for you to check</span>
            </span>
            <Button onClick={() => setConfirmBulk("attendance")}>Verify {verifiable.length}</Button>
          </div>
        </div>
      )}

      <Modal open={Boolean(selected) && selected?.kind !== "final"} onClose={() => setSelectedKey(null)} title={selected ? selected.entry.student_name : ""} size="lg">
        {selected && selected.kind !== "final" && <ReviewDetail item={selected} work={work} onDecided={() => setSelectedKey(null)} />}
      </Modal>

      <RecordTimeIn open={recording} onClose={() => setRecording(false)} work={work} />

      <ConfirmDialog
        open={confirmBulk !== null}
        title={confirmBulk ? BULK[confirmBulk].title(bulkRows.length) : ""}
        message={confirmBulk ? BULK[confirmBulk].message : ""}
        confirmLabel={confirmBulk ? BULK[confirmBulk].confirm : "Confirm"}
        busy={bulkBusy}
        busyProcess="verify"
        onConfirm={() => void decideAll()}
        onCancel={() => setConfirmBulk(null)}
      >
        <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm text-slate-700">
          {bulkRows.map((row) => (
            <li key={row.key} className="flex justify-between gap-3">
              <span className="truncate">{row.name}</span>
              <span className="tabular shrink-0 truncate text-slate-500">{row.what}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </SupervisorLayout>
  );
}

/** "Live · updated 8:14 PM": the queue is kept current on its own (lib/liveRefresh.ts). */
function LiveLine({ updatedAt, now }: { updatedAt: Date | null; now: Date }) {
  if (!updatedAt) return null;
  const stale = now.getTime() - updatedAt.getTime() > 2 * 60_000;
  const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(updatedAt);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600" title="New work appears here as your interns send it.">
      <span className={`live-dot ${stale ? "live-dot--stale" : ""}`} aria-hidden="true" />
      {stale ? "Updated" : "Live · updated"} {time}
    </span>
  );
}
