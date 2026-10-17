import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button, ErrorNotice, FormError, Modal, StatusBadge } from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate, getInitials, phDateKey } from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { errorText, toast } from "../../lib/toast";
import { useDtrCertifications } from "../../lib/useDtrCertifications";
import { useFinalEvaluation } from "../../lib/useFinalEvaluation";
import { useHolidays } from "../../lib/useHolidays";
import { useOnline } from "../../lib/useOnline";
import { fetchStudentPerformance, type PerformanceRules, type PerformanceStudent } from "./performance";
import { changedByOthers, coordinatorRequest } from "./request";
import {
  GROUPS,
  TABS,
  buildWeeks,
  groupOf,
  initialOverviewState,
  isOverdueTask,
  recordContext,
  type AttentionAction,
  type LogFilter,
  type Overview,
  type OverviewState,
  type Pending,
  type Tab,
  type TaskFilter,
} from "./studentRecord/model";
import RecordOverview from "./studentRecord/RecordOverview";
import UploadUsage from "./UploadUsage";
import {
  AttendanceSection,
  DocumentsSection,
  EvaluationsSection,
  JournalsSection,
  NotesSection,
  ScheduleSection,
  TasksSection,
  TimeRecordSection,
} from "./studentRecord/RecordSections";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S RECORD
|--------------------------------------------------------------------------
|
| Everything the programme holds about a single student, in one place,
| drawn as a folder: the student's name on its label tab, five groups of
| sections on its rim, and the open section inside. The Overview reads in
| order of urgency: a summary, what is waiting on someone, the placement
| week by week (or a month at a time) with each day opening to its shift,
| and the rest of the detail folded away.
|
| Reviewing stays with the supervisor; the coordinator can decide
| documents and absences here only when the student has no active
| supervisor to do it. "?tab=" in the address opens a section (the
| Requirements page links to ?tab=schedule).
|
*/

export default function StudentRecord() {
  const { studentId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get("tab") as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : "overview";

  const [data, setData] = useState<Overview | null>(null);
  const [performance, setPerformance] = useState<{ student: PerformanceStudent | null; rules: PerformanceRules } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const [rejecting, setRejecting] = useState<Pending | null>(null);

  // Where the coordinator is in each part of the page, kept while they move between sections.
  const [overview, setOverview] = useState<OverviewState>(initialOverviewState);
  const [lastSection, setLastSection] = useState<Partial<Record<string, Tab>>>({});
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [openReports, setOpenReports] = useState<string[] | null>(null);

  const online = useOnline();
  const holidays = useHolidays("coordinator");
  const { certifications } = useDtrCertifications("coordinator", studentId || undefined);
  const final = useFinalEvaluation("coordinator", studentId || undefined);
  const folderRef = useRef<HTMLElement | null>(null);
  const rimRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      try {
        const path = `/api/coordinator/students/${encodeURIComponent(studentId)}`;
        const [record, figures] = await Promise.all([
          coordinatorRequest<Overview>(`${path}/overview`),
          // Extra to the record: if the figures cannot be loaded the record stands without them.
          fetchStudentPerformance(studentId).catch(() => null),
        ]);
        const now = new Date();
        setData(record);
        if (figures) setPerformance({ student: figures.student, rules: figures });
        setLoadedAt(now);
        setError("");
        // The first time the record opens, today's day is the one shown open.
        setOverview((current) => (current.day === null && current.week === null ? { ...current, day: phDateKey(now) } : current));
      } catch (loadError) {
        setError(errorText(loadError, "Could not load this student's record."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [studentId, setOverview]
  );

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  // A decision or a new log from someone else arrives as a live notification; the record follows it.
  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const student = data?.student;
  const canDecide = Boolean(student && !student.supervisor_active);
  const perf = performance?.student ?? null;
  const today = phDateKey(loadedAt);
  const lateAfter = performance?.rules.thresholds?.late_after_minutes ?? 15;
  const ctx = useMemo(() => (data ? recordContext(data, holidays, lateAfter, today) : null), [data, holidays, lateAfter, today]);
  const weeks = useMemo(() => (data && ctx ? buildWeeks(ctx, data, perf?.projected_finish ?? null) : []), [data, ctx, perf]);

  const goTo = useCallback(
    (next: Tab, scroll = true) => {
      setLastSection((current) => ({ ...current, [groupOf(next).id]: next }));
      setSearchParams((params) => {
        const copy = new URLSearchParams(params);
        if (next === "overview") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      }, { replace: true });
      if (scroll) {
        const folder = folderRef.current;
        if (folder && folder.getBoundingClientRect().top < 0) folder.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    },
    [setSearchParams]
  );

  const openAction = (action: Extract<AttentionAction, { kind: "open" }>) => {
    if (action.logFilter) setLogFilter(action.logFilter);
    if (action.taskFilter) setTaskFilter(action.taskFilter);
    if (action.report) setOpenReports([action.report]);
    if (action.section === "absences") setOverview((current) => ({ ...current, open: { ...current.open, absences: true } }));
    goTo(action.tab, !action.section);
    if (action.section === "absences") window.setTimeout(() => document.getElementById("record-absences")?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    if (action.report) window.setTimeout(() => document.getElementById(`report-${action.report}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };

  const decide = async (item: Pending, approve: boolean, note = "") => {
    // Iteration 12: the version this record was loaded with; refused (409) if someone decided it meanwhile.
    const expected_version = (item.kind === "document" ? data?.documents : data?.absences)?.find((entry) => entry.id === item.id)?.version;
    try {
      await coordinatorRequest(item.kind === "document" ? `/api/documents/${item.id}/review` : `/api/absences/${item.id}/review`, {
        method: "PATCH",
        body:
          item.kind === "document"
            ? { status: approve ? "Approved" : "Rejected", review_notes: note, expected_version }
            : { status: approve ? "Excused" : "Unexcused", notes: note, expected_version },
      });
    } catch (decisionError) {
      // Changed by someone else first: show the record as it is now, then say why.
      if (changedByOthers(decisionError)) await load(true);
      throw decisionError;
    }
    toast.success(
      `${item.label} ${item.kind === "document" ? (approve ? "approved" : "rejected") : approve ? "excused" : "marked unexcused"}. ${student?.name || "The student"} has been notified.`
    );
    notifyDataChanged();
    await load(true);
  };

  const approve = (item: Pending) =>
    decide(item, true).catch((decisionError: unknown) => {
      toast.error(errorText(decisionError, "That could not be saved."));
    });

  // The folder's rim: when the five groups do not fit beside the name, the icons beside them go,
  // then the groups take a row of their own. Phones lay the rim out by CSS alone.
  useEffect(() => {
    const rim = rimRef.current;
    const nav = navRef.current;
    if (!rim || !nav) return;
    const fit = () => {
      rim.dataset.fit = "full";
      if (window.matchMedia("(max-width: 767px)").matches) return;
      if (nav.scrollWidth > nav.clientWidth + 1) rim.dataset.fit = "tight";
      if (nav.scrollWidth > nav.clientWidth + 1) rim.dataset.fit = "stacked";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(rim);
    return () => observer.disconnect();
  }, [data]);

  const back = (
    <Link to="/coordinator/students" aria-label="All students" title="All students" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-card hover:border-psu-200 hover:text-psu-700">
      <Icon name="chevron-left" />
    </Link>
  );

  if (loading || !data || !student || !ctx) {
    return (
      <CoordinatorLayout title={student?.name || "Student record"} actions={<Link to="/coordinator/students" className="text-sm font-semibold text-psu-700">All students</Link>}>
        {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : <BrandLoader variant="page" role="coordinator" process="students" message="Loading this student’s record…" />}
      </CoordinatorLayout>
    );
  }

  const journals = data.journals || [];
  const meta: Partial<Record<Tab, { count?: number; attention?: boolean }>> = {
    attendance: { count: data.attendance.length, attention: data.attendance.some((log) => log.status === "Pending") },
    schedule: { attention: data.schedule.length === 0 },
    tasks: { count: data.tasks.length, attention: data.tasks.some((task) => task.status === "Submitted" || isOverdueTask(task, today)) },
    journals: { count: journals.length, attention: journals.some((item) => item.status !== "Reviewed") },
    evaluations: { count: data.evaluations.length },
    documents: { count: data.documents.length, attention: data.documents.some((doc) => doc.status === "Pending") },
  };
  const group = groupOf(tab);
  const subtitle = [student.student_id, student.program, student.company].filter(Boolean).join(" · ");

  const arrows = (event: KeyboardEvent<HTMLElement>, list: Tab[], current: Tab, idPrefix: string) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = list.indexOf(current);
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
    goTo(list[next], false);
    window.setTimeout(() => document.getElementById(`${idPrefix}${idPrefix === "group-" ? groupOf(list[next]).id : list[next]}`)?.focus(), 0);
  };
  const groupTargets = GROUPS.map((item) => lastSection[item.id] ?? item.tabs[0].tab);

  return (
    <CoordinatorLayout title={student.name} subtitle={subtitle} hideHeading>
      <section ref={folderRef} aria-labelledby="record-name" className="scroll-mt-2 rounded-[30px] bg-psu-100 px-2 pb-2 shadow-raised ring-1 ring-inset ring-psu-600/10 md:px-2.5 md:pb-2.5 print:bg-transparent print:p-0 print:shadow-none print:ring-0">
        {/* The rim: the label tab with the student's name, and the five groups. */}
        <div ref={rimRef} data-fit="full" className="group/rim max-md:contents md:sticky md:top-0 md:z-20 md:flex md:items-end md:rounded-t-[30px] md:bg-psu-100 md:pt-2.5 data-[fit=stacked]:flex-wrap print:hidden">
          <div className="relative z-[1] mt-2 flex min-w-0 items-center gap-3 rounded-t-[18px] bg-slate-50 p-2.5 md:mt-0 md:max-w-[46%] md:flex-[0_1_auto] md:rounded-tr-none md:rounded-tl-[22px] md:pb-2 md:pl-2.5 md:pr-1.5 md:pt-2.5 group-data-[fit=tight]/rim:md:max-w-[40%] group-data-[fit=stacked]/rim:md:max-w-none group-data-[fit=stacked]/rim:md:basis-full group-data-[fit=stacked]/rim:md:rounded-t-[22px]">
            {back}
            <span aria-hidden="true" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-linear-to-b from-gold-300 to-gold-400 text-[15px] font-bold text-psu-950">
              {getInitials(student.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 id="record-name" className="text-lg font-bold leading-tight tracking-tight text-slate-900 md:truncate md:text-[21px]">{student.name}</h1>
                <span className="flex flex-wrap gap-1.5 group-data-[fit=tight]/rim:md:hidden">
                  <StatusBadge status={student.is_active ? "Active" : "Deactivated"} tone={student.is_active ? "good" : "neutral"} />
                  {student.completed_at && <StatusBadge status={`Hours completed ${formatDate(student.completed_at)}`} tone="good" />}
                  {student.completion_requested_at && <StatusBadge status={`Asked for completion review ${formatDate(student.completion_requested_at)}`} tone="info" />}
                </span>
              </div>
              <p className="truncate text-[12.5px] text-slate-600">{subtitle}</p>
            </div>
            <svg aria-hidden="true" viewBox="0 0 67 100" preserveAspectRatio="none" className="absolute -right-[66px] top-0 hidden h-full w-[67px] md:block group-data-[fit=stacked]/rim:hidden">
              <path d="M0 0 C 32 0, 34 100, 67 100 L 0 100 Z" className="fill-slate-50" />
            </svg>
          </div>

          <div
            ref={navRef}
            role="tablist"
            aria-label="Sections of the record"
            onKeyDown={(event) => arrows(event, groupTargets, groupTargets[GROUPS.indexOf(group)], "group-")}
            className="sticky top-0 z-20 flex gap-0 border-b border-slate-200 bg-slate-50 p-1.5 shadow-[0_8px_12px_-12px_rgb(15_30_110/0.35)] md:static md:min-w-0 md:flex-1 md:items-center md:gap-1 md:overflow-x-auto md:border-0 md:bg-transparent md:py-1 md:pb-3 md:pl-[76px] md:pr-2 md:shadow-none group-data-[fit=stacked]/rim:md:order-first group-data-[fit=stacked]/rim:md:basis-full group-data-[fit=stacked]/rim:md:pl-1 [scrollbar-width:none]"
          >
            {GROUPS.map((item, index) => {
              const on = item === group;
              const attention = item.tabs.some((section) => meta[section.tab]?.attention);
              const count = item.tabs.length === 1 ? meta[item.tabs[0].tab]?.count : undefined;
              return (
                <button
                  key={item.id}
                  id={`group-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="record-panel"
                  tabIndex={on ? 0 : -1}
                  title={item.tabs.length > 1 ? `${item.label}: ${item.tabs.map((section) => section.label).join(", ")}` : item.label}
                  onClick={() => goTo(groupTargets[index], false)}
                  className={`relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-xl px-0 text-[11px] font-medium tracking-tight transition-colors md:h-10 md:flex-none md:flex-row md:gap-[7px] md:rounded-full md:pl-[11px] md:pr-[13px] md:text-[13.5px] md:tracking-normal pointer-coarse:md:h-11 ${
                    on ? "bg-white font-semibold text-psu-900 shadow-raised" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <Icon name={item.icon} size={15} className={`${on ? "text-psu-700" : "text-slate-500"} group-data-[fit=tight]/rim:md:hidden`} />
                  <span className="max-w-full truncate">{item.label}</span>
                  {count !== undefined && (
                    <span className={`tabular absolute left-[calc(50%+6px)] top-[3px] inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold md:static md:h-5 md:min-w-5 md:px-1.5 md:text-[11px] ${on ? "bg-psu-700 text-white" : "bg-psu-950/10 text-slate-600"}`}>
                      {count}
                    </span>
                  )}
                  {attention && (
                    <>
                      <span aria-hidden="true" className="absolute left-[calc(50%-16px)] top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-psu-100 md:left-auto md:right-1.5" />
                      <span className="sr-only">, needs attention</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div id="record-panel" role="tabpanel" aria-labelledby={`group-${group.id}`} className="min-w-0 rounded-b-[18px] bg-slate-50 p-3 sm:p-4 md:rounded-[0_22px_22px_22px] md:p-6 print:bg-white print:p-0">
          <div key={tab} className="animate-page-in">
            {group.tabs.length > 1 && (
              <div
                role="tablist"
                aria-label={`${group.label} sections`}
                onKeyDown={(event) => arrows(event, group.tabs.map((section) => section.tab), tab, "section-")}
                className="-mt-1 mb-5 flex w-full max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card md:w-fit print:hidden [scrollbar-width:none]"
              >
                {group.tabs.map((section) => {
                  const on = section.tab === tab;
                  const info = meta[section.tab];
                  return (
                    <button
                      key={section.tab}
                      id={`section-${section.tab}`}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => goTo(section.tab, false)}
                      className={`relative inline-flex h-[38px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-medium md:flex-none md:px-3.5 md:text-[13.5px] pointer-coarse:h-11 ${
                        on ? "bg-psu-50 font-semibold text-psu-900 ring-1 ring-inset ring-psu-600/15" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon name={section.icon} size={15} className={`hidden md:block ${on ? "text-psu-700" : "text-slate-400"}`} />
                      {section.label}
                      {info?.count !== undefined && (
                        <span className={`tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? "bg-psu-700 text-white" : "bg-slate-100 text-slate-600"}`}>{info.count}</span>
                      )}
                      {info?.attention && (
                        <>
                          <span aria-hidden="true" className="absolute right-1 top-1 h-[7px] w-[7px] rounded-full bg-amber-500" />
                          <span className="sr-only">, needs attention</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => void load(true)} /></div>}

            {canDecide && tab !== "record" && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 print:hidden">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>
                  {student.supervisor_name
                    ? `${student.supervisor_name}'s account is deactivated, so nobody is reviewing this student's work.`
                    : "This student has no supervisor, so nobody is reviewing their work."}{" "}
                  You can decide their pending documents and absences here until one is assigned.
                </span>
              </p>
            )}

            {tab === "overview" && (
              <RecordOverview
                data={data}
                ctx={ctx}
                weeks={weeks}
                perf={perf}
                rules={performance?.rules ?? null}
                canDecide={canDecide}
                online={online}
                loadedAt={loadedAt}
                refreshing={refreshing}
                onRefresh={() => void load(true)}
                onOpen={openAction}
                onApprove={approve}
                onReject={setRejecting}
                state={overview}
                setState={(patch) => setOverview((current) => ({ ...current, ...patch }))}
              />
            )}
            {tab === "attendance" && <AttendanceSection data={data} ctx={ctx} weeks={weeks} perf={perf} filter={logFilter} onFilter={setLogFilter} />}
            {tab === "schedule" && <ScheduleSection data={data} onSaved={() => void load(true)} />}
            {tab === "record" && <TimeRecordSection data={data} holidays={holidays} certifications={certifications} />}
            {tab === "tasks" && <TasksSection data={data} ctx={ctx} perf={perf} filter={taskFilter} onFilter={setTaskFilter} />}
            {tab === "journals" && (
              <JournalsSection
                data={data}
                weeks={weeks}
                perf={perf}
                // Reports that wait on someone, and the latest, start open.
                open={
                  openReports ??
                  journals
                    .filter((item, _index, list) => item.status !== "Reviewed" || list.every((other) => other.week_start <= item.week_start))
                    .map((item) => String(item.week_start).slice(0, 10))
                }
                onOpenChange={setOpenReports}
              />
            )}
            {tab === "evaluations" && <EvaluationsSection data={data} perf={perf} final={final.evaluation} />}
            {tab === "documents" && (
              <>
                <DocumentsSection data={data} perf={perf} canDecide={canDecide} online={online} onApprove={approve} onReject={setRejecting} />
                <UploadUsage studentId={studentId} />
              </>
            )}
            {tab === "notes" && <NotesSection data={data} />}
          </div>
        </div>
      </section>

      {rejecting && (
        <ReasonDialog
          key={`${rejecting.kind}-${rejecting.id}`}
          item={rejecting}
          online={online}
          onClose={() => setRejecting(null)}
          onSubmit={async (note) => {
            await decide(rejecting, false, note);
            setRejecting(null);
          }}
        />
      )}
    </CoordinatorLayout>
  );
}

/** Asks for the reason the student will be shown when something is refused. */
function ReasonDialog({
  item,
  online,
  onClose,
  onSubmit,
}: {
  item: Pending;
  online: boolean;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!note.trim()) return setError("Write a reason. The student will see it.");
    if (!online) return setError("You're offline. This can't be saved until your connection is back.");
    setBusy(true);
    setError("");
    try {
      await onSubmit(note.trim());
    } catch (submitError) {
      setError(errorText(submitError, "That could not be saved."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={item.kind === "document" ? `Reject ${item.label}` : "Mark as unexcused"}
      description={item.kind === "absence" ? item.label : undefined}
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={busy} failed={Boolean(error)}>
            {item.kind === "document" ? "Reject document" : "Mark unexcused"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor="decision-reason" className="block text-sm font-medium text-slate-700">
          Reason
        </label>
        <textarea
          id="decision-reason"
          rows={4}
          maxLength={1000}
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="The student will see this."
          className="field resize-none"
        />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
