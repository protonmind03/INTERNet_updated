import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, Modal, SkeletonRows } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatDate, formatDayDate, formatHours, greetingFor, firstNameOf } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useFocus } from "../../lib/useFocusRecord";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useProjections } from "../../lib/useProjections";
import { sameId } from "../../lib/ids";
import { FINAL_DUE_WITHIN_HOURS, finalEvaluationPath, useEvaluatedIds, useFinalDue } from "./finalDue";
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
| REVIEW: ONE WORKSPACE (sv10-26, second pass)
|--------------------------------------------------------------------------
|
| Everything that waits for the supervisor, in one module. The side menu
| has one Review entry; inside, a strip of kinds (Everything, Time-ins,
| Absences, Tasks, Documents, Weekly reports, Final evaluations), each
| with its own colour and icon, its count and how long its oldest has
| waited. The chosen kind is in the address (?tab=), so a link, Back and
| a notification land on it. Under the strip, one line of tools for every
| kind: search, program or block, intern, sort, and the chosen kind's
| bulk action. The list keeps each kind's colour on its rows, so a
| document never reads as a time-in.
|
| Unchanged from before: every decision (useSupervisorWork: version
| checks, undo, the rules for what Verify all may take), the day board,
| today's register on a phone, This week, Record time-in, decided-today
| stamps, the "New" mark on what arrived while the page was open, and a
| notification opening its item (?focus=) or, once decided, its own page.
|
*/

type Tab = "all" | "time-ins" | "absences" | "tasks" | "docs" | "reports" | "final";

/** The kinds that can be decided several at a time. */
type BulkKind = "attendance" | "document" | "absence";

type KindDef = {
  tab: Exclude<Tab, "all">;
  kind: ReviewItem["kind"];
  label: string;
  /** What the supervisor does with this kind, in a few words. */
  job: string;
  icon: IconName;
  /** The kind's colour (index.css: .rk--…). */
  tone: string;
  bulk?: BulkKind;
};

/** The kinds, in the order the strip and the full list show them. Time-ins first: they hold hours back. */
const KINDS: KindDef[] = [
  { tab: "time-ins", kind: "attendance", label: "Time-ins", job: "Verify the day, or reject the photo or the day", icon: "camera", tone: "timein", bulk: "attendance" },
  { tab: "absences", kind: "absence", label: "Absences", job: "Excuse it, or mark it unexcused", icon: "calendar", tone: "absence", bulk: "absence" },
  { tab: "tasks", kind: "task", label: "Tasks", job: "Rate the work, or return it with a note", icon: "tasks", tone: "task" },
  { tab: "docs", kind: "document", label: "Documents", job: "Approve the file, or reject it with a note", icon: "document", tone: "document", bulk: "document" },
  { tab: "reports", kind: "journal", label: "Weekly reports", job: "Mark it reviewed, or return it", icon: "note", tone: "report" },
  { tab: "final", kind: "final", label: "Final evaluations", job: `Due within ${FINAL_DUE_WITHIN_HOURS} h of the requirement`, icon: "star", tone: "final" },
];
const KIND_OF_TAB = new Map(KINDS.map((def) => [def.tab, def]));
const DEF_OF_KIND = new Map(KINDS.map((def) => [def.kind, def]));

const BULK: Record<BulkKind, { title: (count: number) => string; message: string; confirm: string; done: (count: number) => string; button: (count: number) => string }> = {
  attendance: {
    title: (count) => `Verify ${count} ordinary time-ins?`,
    message: "Every pending log that has a time-out will be marked verified. Time-ins recorded offline stay for you to confirm one by one.",
    confirm: "Verify all",
    done: (count) => `${count} attendance ${count === 1 ? "log" : "logs"} verified.`,
    button: (count) => `Verify all ${count}`,
  },
  document: {
    title: (count) => `Approve ${count} documents?`,
    message: "Every document waiting for you will be marked approved. Review one you want to reject by itself first.",
    confirm: "Approve all",
    done: (count) => `${count} ${count === 1 ? "document" : "documents"} approved.`,
    button: (count) => `Approve all ${count}`,
  },
  absence: {
    title: (count) => `Excuse ${count} absences?`,
    message: "Every absence waiting for you will be marked excused. Review one you do not accept by itself first.",
    confirm: "Excuse all",
    done: (count) => `${count} ${count === 1 ? "absence" : "absences"} excused.`,
    button: (count) => `Excuse all ${count}`,
  },
};

/** Where a decided item of each kind can still be seen, with ?focus= on it. */
const DECIDED_PAGE: Record<string, string> = {
  attendance: "/supervisor/attendance",
  absence: "/supervisor/attendance",
  document: "/supervisor/documents",
  journal: "/supervisor/journals",
};

/** How long an item stays marked "New" after it arrived on screen. */
const NEW_FOR_MS = 3 * 60_000;

type Sort = "oldest" | "newest" | "intern";
const SORTS: { value: Sort; label: string }[] = [
  { value: "oldest", label: "Oldest waiting first" },
  { value: "newest", label: "Newest first" },
  { value: "intern", label: "Intern A–Z" },
];

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

/** When an item started waiting ("" for a final evaluation, which waits on hours, not a date). */
const sinceOf = (item: ReviewItem) => (item.kind === "final" ? "" : item.waitingSince || "");

/** What a search looks through: the intern and what the item is. */
function searchText(item: ReviewItem): string {
  const entry = item.entry as Record<string, unknown>;
  const parts = [item.entry.student_name, item.entry.student_id, entry.title, entry.doc_type, entry.reason, entry.date, entry.week_start, DEF_OF_KIND.get(item.kind)?.label];
  if (item.kind === "attendance" || item.kind === "absence") parts.push(formatDayDate(item.entry.date));
  return parts.filter(Boolean).join(" ").toLowerCase();
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

  // What arrived while the page was open is marked "New" for a few minutes. The first list
  // seen is the baseline; each later one adds the keys it brings, with when they came.
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

  // The kind is in the address (?tab=), the one place it is kept, so a link, Back and the menu agree.
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && (asked === "all" || KIND_OF_TAB.has(asked as Exclude<Tab, "all">)) ? asked : "all";
  const chosen = tab === "all" ? null : KIND_OF_TAB.get(tab)!;
  const [internId, setInternId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("oldest");
  const [toolsOpen, setToolsOpen] = useState(false);
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

  // The queue narrowed by the tools (everything but the kind): what the strip counts.
  const scoped = useMemo(() => {
    const text = search.trim().toLowerCase();
    const list = queue.filter(
      (item) =>
        (!internId || sameId(item.entry.student_id, internId)) &&
        inGroup(item.entry.student_id) &&
        (!text || searchText(item).includes(text))
    );
    return [...list].sort((a, b) =>
      sort === "intern"
        ? a.entry.student_name.localeCompare(b.entry.student_name) || sinceOf(a).localeCompare(sinceOf(b))
        : sort === "newest"
          ? sinceOf(b).localeCompare(sinceOf(a))
          : sinceOf(a).localeCompare(sinceOf(b))
    );
  }, [queue, internId, inGroup, search, sort]);
  const ofKind = (def: KindDef) => scoped.filter((item) => item.kind === def.kind);
  const visible = chosen ? ofKind(chosen) : scoped;
  const selected = queue.find((item) => item.key === selectedKey);
  const narrowed = Boolean(search.trim() || internId || grouping.group);

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
  const bulkCount = (kind: BulkKind) => (kind === "attendance" ? verifiable.length : kind === "document" ? waitingDocuments.length : waitingAbsences.length);
  // Verify all takes even one; approving or excusing together is offered from two.
  const bulkOffered = (kind: BulkKind) => bulkCount(kind) >= (kind === "attendance" ? 1 : 2);
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
    copy.delete("focus");
    setParams(copy, { replace: true });
  };
  const clearTools = () => {
    setSearch("");
    setInternId("");
    grouping.setGroup("");
  };

  const logs = todaysLogs(work);
  const today = phToday();
  const decidedToday = work.attendance
    .filter((entry) => (entry.status === "Verified" || entry.status === "Rejected") && entry.verified_at && String(entry.verified_at).slice(0, 10) === today)
    .slice(0, 4);
  const shownInterns = interns.filter((intern) => inGroup(intern.student_id));
  const firstName = firstNameOf(supervisor?.name);
  const company = supervisor?.company || "your company";
  const oldestOf = (items: ReviewItem[]) => items.map(sinceOf).filter(Boolean).sort()[0];

  /** One waiting item, on its kind's colour: a decision card, or a final evaluation to start. */
  const renderItem = (item: ReviewItem) => {
    const def = DEF_OF_KIND.get(item.kind)!;
    const fresh = isNew(item.key);
    return (
      <div key={item.key} className={`rk-row rk--${def.tone} relative ${fresh ? "review-new" : ""}`} data-new={fresh || undefined}>
        {fresh && (
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
            grouped={computer}
            busy={busyKey === item.key}
            onVerify={() => item.kind === "attendance" && void verifyOne(item)}
            onOpen={() => setSelectedKey(item.key)}
            onRejectChoice={() => setSelectedKey(item.key)}
          />
        )}
      </div>
    );
  };

  /** The bulk action of one kind, when it can be offered. */
  const bulkButton = (kind: BulkKind, compact = false) =>
    bulkOffered(kind) ? (
      <span className="flex items-center gap-1">
        <Button variant={compact ? "secondary" : "primary"} icon={kind === "attendance" ? undefined : "check-circle"} onClick={() => setConfirmBulk(kind)}>
          {BULK[kind].button(bulkCount(kind))}
        </Button>
        {kind === "attendance" && !compact && (
          <InfoTip label="About Verify all" text="Verifies the ordinary time-ins that have a time-out. Time-ins recorded offline stay for you to confirm one by one." />
        )}
      </span>
    ) : null;

  // The kind strip: Everything first, then each kind in its colour.
  const strip = (
    <div role="tablist" aria-label="What to review" className={computer ? "rk-strip" : "rk-strip rk-strip--scroll"}>
      {[null, ...KINDS].map((def) => {
        const key: Tab = def ? def.tab : "all";
        const items = def ? ofKind(def) : scoped;
        const on = tab === key;
        const fresh = items.filter((item) => isNew(item.key)).length;
        const oldest = oldestOf(items);
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => pickTab(key)}
            className={`rk-card ${def ? `rk--${def.tone}` : "rk--all"} ${on ? "rk-card--on" : ""} ${items.length === 0 ? "rk-card--empty" : ""}`}
          >
            <span className="rk-card-top">
              <span className="rk-icon" aria-hidden="true">
                <Icon name={def ? def.icon : "inbox"} size={17} />
              </span>
              <span className="rk-count tabular">{loading ? "…" : items.length}</span>
            </span>
            <span className="rk-label">{def ? def.label : "Everything"}</span>
            <span className="rk-line">
              {fresh > 0 ? <b className="rk-fresh">{fresh} new</b> : def?.kind === "final" ? (items.length ? "Ready to start" : "None due") : oldest ? `Oldest ${waitingText(oldest).toLowerCase()}` : "Nothing waiting"}
            </span>
          </button>
        );
      })}
    </div>
  );

  // One line of tools, the same for every kind.
  const tools = (
    <div className="rk-tools">
      <label className="relative block min-w-0 flex-1 basis-52 sm:max-w-xs">
        <span className="sr-only">Search what is waiting</span>
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by intern, task or file" className="field pl-9" />
      </label>
      <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
      {interns.length > 1 && (
        <label className="block">
          <span className="sr-only">Intern</span>
          <select value={internId} onChange={(event) => setInternId(event.target.value)} className="field w-auto max-w-56">
            <option value="">All interns</option>
            {shownInterns.map((intern) => (
              <option key={intern.student_id} value={intern.student_id}>
                {intern.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="sr-only">Sort</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="field w-auto" aria-label="Sort what is waiting">
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {narrowed && (
        <button type="button" onClick={clearTools} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-semibold text-psu-700 hover:bg-psu-50">
          Clear
        </button>
      )}
    </div>
  );

  const empty = (
    <Card>
      <EmptyState
        icon="check-circle"
        title={queue.length === 0 ? "You're all caught up" : narrowed ? "Nothing matches" : `No ${chosen ? chosen.label.toLowerCase() : "items"} waiting`}
        description={queue.length === 0 ? "New time-ins, tasks, documents, absences and weekly reports appear here." : narrowed ? "Clear the search or the filters to see the rest." : undefined}
        action={
          narrowed ? (
            <Button variant="secondary" onClick={clearTools}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    </Card>
  );

  const list = loading ? (
    <SkeletonRows rows={4} />
  ) : visible.length === 0 ? (
    empty
  ) : chosen ? (
    <div className={computer ? "divide-y divide-(--role-hairline)" : "space-y-3"}>{visible.map(renderItem)}</div>
  ) : (
    // Everything, kind by kind, each under a heading in its colour.
    <div className={computer ? "" : "space-y-5"}>
      {KINDS.map((def) => {
        const items = ofKind(def);
        if (items.length === 0) return null;
        return (
          <section key={def.kind} aria-label={`${def.label}, ${items.length}`} className={`rk-section rk--${def.tone}`}>
            <div className={`rk-section-head ${computer ? "rk-section-head--sticky" : ""}`}>
              <span className="rk-icon rk-icon--sm" aria-hidden="true">
                <Icon name={def.icon} size={14} />
              </span>
              <h3 className="text-[14.5px] font-bold text-slate-900">{def.label}</h3>
              <span className="rk-pill tabular">{items.length}</span>
              <span className="hidden text-[12.5px] text-slate-600 sm:inline">{def.job}</span>
              <span className="ml-auto flex items-center gap-1">
                {def.bulk && def.bulk !== "attendance" && bulkButton(def.bulk, true)}
                <button type="button" onClick={() => pickTab(def.tab)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-bold text-slate-700 hover:bg-white">
                  Only these
                  <Icon name="chevron-right" size={14} />
                </button>
              </span>
            </div>
            <div className={computer ? "divide-y divide-(--role-hairline)" : "space-y-3"}>{items.map(renderItem)}</div>
          </section>
        );
      })}
    </div>
  );

  const showDecided = decidedToday.length > 0 && (tab === "all" || tab === "time-ins");
  const title = chosen ? chosen.label : "Everything waiting";
  const headBulk = chosen ? (chosen.bulk ? bulkButton(chosen.bulk) : null) : bulkButton("attendance");

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
          // The day as a whole on Everything; a chosen kind opens straight on its list.
          tab === "all" && !loading && shownInterns.length > 0 && <DayBoard company={company} interns={shownInterns} logs={logs} now={now} />
        ) : loading ? (
          <RegisterSkeleton />
        ) : (
          shownInterns.length > 0 && <RegisterCard interns={shownInterns} logs={logs} />
        )}

        <section aria-labelledby="review-title" className="space-y-3">
          <h2 id="review-title" className="sr-only">
            What waits for your review
          </h2>
          {strip}
          {computer ? (
            tools
          ) : (
            <>
              <button type="button" onClick={() => setToolsOpen((value) => !value)} aria-expanded={toolsOpen} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <Icon name="filter" size={16} />
                Search and filter{narrowed ? " (on)" : ""}
              </button>
              {toolsOpen && tools}
            </>
          )}
        </section>

        {tab === "final" ? (
          // Final evaluations: every intern and where theirs stands, not a queue to clear.
          <FinalEvaluations interns={shownInterns.filter((intern) => !internId || sameId(intern.student_id, internId))} evaluated={evaluated} loading={loading} />
        ) : (
          <div className={computer ? "grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}>
            <section aria-labelledby="to-verify-title" className={computer ? `overflow-hidden rounded-2xl bg-white rk-panel ${chosen ? `rk--${chosen.tone}` : "rk--all"}` : ""}>
              {computer ? (
                <div className="rk-panel-head">
                  <span className="rk-icon" aria-hidden="true">
                    <Icon name={chosen ? chosen.icon : "inbox"} size={18} />
                  </span>
                  <span className="min-w-0">
                    <h2 id="to-verify-title" className="font-display text-[21px] font-extrabold leading-tight text-slate-900">
                      {title} <span className="tabular text-slate-500">· {visible.length}</span>
                    </h2>
                    <span className="block text-[13px] text-slate-600">
                      {chosen ? chosen.job : "Every kind, oldest first within each"}
                      {oldestOf(visible) ? ` · oldest ${waitingText(oldestOf(visible)).toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto">{headBulk}</span>
                </div>
              ) : (
                <h2 id="to-verify-title" className="mb-2 px-1 text-[15px] font-bold text-slate-900">
                  {title} <span className="tabular text-slate-500">· {visible.length}</span>
                </h2>
              )}
              {!computer && chosen?.bulk && chosen.bulk !== "attendance" && bulkOffered(chosen.bulk) && <div className="mb-3">{bulkButton(chosen.bulk, true)}</div>}
              {list}
              {showDecided && (
                <div className={computer ? "border-t border-(--role-hairline)" : "card-hairline mt-3 overflow-hidden rounded-2xl"}>
                  <h3 className="sr-only">Decided today</h3>
                  <div className="divide-y divide-(--role-hairline)">
                    {decidedToday.map((entry) => (
                      <DecidedRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </section>
            {computer && <ThisWeek work={work} finalDue={finalDue} projections={projections} />}
          </div>
        )}

        {!loading && interns.length === 0 && !work.error && (
          <p className="text-sm text-slate-600">No interns are assigned to you yet. Your OJT coordinator assigns interns to supervisors.</p>
        )}
      </div>

      {/* Phones and tablets: verify the ordinary time-ins together, above the dock. */}
      {!computer && verifiable.length > 0 && (tab === "all" || tab === "time-ins") && (
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
