import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import PsuFormSheet, { FormField } from "../../components/PsuFormSheet";
import { Button, ErrorNotice, SkeletonRows } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatHours } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useTimeRecordHeader } from "../../lib/timeRecordHeader";
import { traineeRecord, type DailyReport, type MonthlyReport } from "../../lib/traineeRecord";
import { restoreAutosave, saveStateText, useAutosave } from "../../lib/useAutosave";
import { useTimeIn } from "./timeInContext";
import { logDateKey } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| MONTHLY REPORTS (Progress reports, revisions November 2026)
|--------------------------------------------------------------------------
|
| As the trainee chose: the month put together from what the app already
| has (days worked, verified hours, tasks finished, weekly reports, events
| and photos from the daily reports) with the trainee's own short summary
| and highlights on top. No one reviews it. Print gives it on a page in the
| university's style for the narrative report (the university has no form
| for a monthly report, so it carries no form code).
|
*/

type Task = { id: number; title: string; status: string; reviewed_at?: string | null; submitted_at?: string | null; due_date: string | null };
type Journal = { week_start: string; status: string };

function monthOf(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function lastDay(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

export default function MonthlyReports() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const { attendance } = useTimeIn();
  const today = phToday();
  const [month, setMonth] = useState(monthOf(today));
  const [saved, setSaved] = useState<Map<string, MonthlyReport>>(new Map());
  const [days, setDays] = useState<DailyReport[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const header = useTimeRecordHeader("student", studentId, null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const id = encodeURIComponent(studentId);
      const [months, daily, taskResponse, journalResponse] = await Promise.all([
        traineeRecord.monthlyReports("student", studentId),
        traineeRecord.dailyReports("student", studentId, `${month}-01`, lastDay(month) > today ? today : lastDay(month)),
        savedFetch("student", "tasks", `${API_URL}/api/tasks/student/${id}`, withStudentAuth()).catch(() => null),
        savedFetch("student", "journals", `${API_URL}/api/journals/student/${id}`, withStudentAuth()).catch(() => null),
      ]);
      setSaved(new Map(months.months.map((item) => [item.month, item])));
      setDays(daily.reports);
      if (taskResponse?.ok) {
        const list = await taskResponse.json();
        setTasks(Array.isArray(list) ? list : []);
      }
      if (journalResponse?.ok) {
        const data = await journalResponse.json();
        setJournals(Array.isArray(data.journals) ? data.journals : []);
      }
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the month.");
    } finally {
      setLoaded(true);
    }
  }, [studentId, month, today]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const facts = useMemo(() => {
    const logs = attendance.logs.filter((log) => log.time_in && monthOf(logDateKey(log)) === month);
    const verified = logs.filter((log) => log.status === "Verified").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    const pending = logs.filter((log) => log.status === "Pending").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    const finished = tasks.filter((task) => ["Submitted", "Reviewed", "Completed"].includes(task.status) && monthOf(String(task.reviewed_at ?? task.submitted_at ?? task.due_date ?? "")) === month);
    const weeks = journals.filter((journal) => monthOf(journal.week_start) === month);
    const events = days.flatMap((day) => day.entries.map((entry) => ({ ...entry, day: day.report_date })));
    const photos = events.reduce((sum, entry) => sum + entry.pictures, 0);
    return { worked: logs.length, verified, pending, finished, weeks, events, photos, written: days.filter((day) => day.summary).length };
  }, [attendance.logs, tasks, journals, days, month]);

  const firstMonth = useMemo(() => {
    const first = attendance.logs.map(logDateKey).sort()[0];
    return first ? monthOf(first) : month;
  }, [attendance.logs, month]);

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}

      <div className="flex items-center justify-between gap-2 rounded-2xl bg-white px-2 py-2 ring-1 ring-inset ring-(--role-hairline) print:hidden">
        <button type="button" onClick={() => setMonth((current) => shiftMonth(current, -1))} disabled={month <= firstMonth} aria-label="The month before" className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-psu-50 disabled:opacity-30">
          <Icon name="chevron-left" size={18} />
        </button>
        <p className="text-[16px] font-extrabold text-slate-900">{formatPhDay(`${month}-15`, { month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => setMonth((current) => shiftMonth(current, 1))} disabled={month >= monthOf(today)} aria-label="The month after" className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-psu-50 disabled:opacity-30">
          <Icon name="chevron-right" size={18} />
        </button>
      </div>

      {!loaded ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="space-y-4 print:hidden">
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: "Days worked", value: String(facts.worked), icon: "calendar" as const },
              { label: "Verified hours", value: formatHours(facts.verified), icon: "hourglass" as const, note: facts.pending > 0 ? `${formatHours(facts.pending)} pending` : undefined },
              { label: "Tasks finished", value: String(facts.finished.length), icon: "tasks" as const },
              { label: "Events · photos", value: `${facts.events.length} · ${facts.photos}`, icon: "image" as const },
            ].map((fact) => (
              <li key={fact.label} className="rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-(--role-hairline)">
                <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                  <Icon name={fact.icon} size={14} />
                  {fact.label}
                </span>
                <span className="font-display tabular mt-1 block text-[24px] font-extrabold leading-tight text-slate-900">{fact.value}</span>
                {fact.note && <span className="text-[12px] text-slate-600">{fact.note}</span>}
              </li>
            ))}
          </ul>

          <MonthWords key={month} studentId={studentId ?? ""} month={month} saved={saved.get(month) ?? null} onPrint={() => window.print()} />

          <section className="rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
            <h3 className="border-b border-(--role-hairline) px-4 py-3 text-[15px] font-extrabold text-slate-900 sm:px-5">From your daily reports</h3>
            {facts.events.length === 0 && facts.written === 0 ? (
              <p className="px-4 py-4 text-[14px] text-slate-600 sm:px-5">No daily reports or events this month yet.</p>
            ) : (
              <ol className="divide-y divide-(--role-hairline)">
                {days
                  .slice()
                  .sort((a, b) => a.report_date.localeCompare(b.report_date))
                  .filter((day) => day.summary || day.entries.length > 0)
                  .map((day) => (
                    <li key={day.report_date} className="flex gap-3 px-4 py-3 sm:px-5">
                      <span className="tabular w-14 shrink-0 text-[13px] font-bold text-psu-800">{formatPhDay(day.report_date, { month: "short", day: "numeric" })}</span>
                      <div className="min-w-0 text-[14px] text-slate-700">
                        {day.summary && <p className="line-clamp-3 whitespace-pre-line">{day.summary}</p>}
                        {day.entries.map((entry) => (
                          <p key={entry.id} className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
                            <Icon name="star" size={13} className="text-psu-600" />
                            {entry.title || "An event"}
                            {entry.pictures > 0 && <span className="text-[12px] font-normal text-slate-500">· {entry.pictures} photo{entry.pictures === 1 ? "" : "s"}</span>}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </div>
      )}

      <PsuFormSheet title="Monthly Progress Report" campus={header?.institution.campus_name}>
        <table>
          <tbody>
            <FormField label="Name of student-intern">{header?.trainee.name ?? student?.name}</FormField>
            <FormField label="Name of company">{header?.trainee.company ?? student?.company}</FormField>
            <FormField label="Month">{formatPhDay(`${month}-15`, { month: "long", year: "numeric" })}</FormField>
            <FormField label="Days worked · verified hours">{`${facts.worked} days · ${formatHours(facts.verified)}`}</FormField>
            <FormField label="Tasks finished">{String(facts.finished.length)}</FormField>
          </tbody>
        </table>
        <section className="psu-form-box">
          <h3>Summary of the month:</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{saved.get(month)?.summary ?? ""}</p>
        </section>
        <section className="psu-form-box">
          <h3>Highlights:</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{saved.get(month)?.highlights ?? ""}</p>
          {facts.events.length > 0 && (
            <ul style={{ marginTop: 6 }}>
              {facts.events.map((entry) => (
                <li key={entry.id}>
                  {formatPhDay(entry.day, { month: "short", day: "numeric" })}: {entry.title || "An event"}
                </li>
              ))}
            </ul>
          )}
        </section>
      </PsuFormSheet>
    </div>
  );
}

type Words = { summary: string; highlights: string };

function MonthWords({ studentId, month, saved, onPrint }: { studentId: string; month: string; saved: MonthlyReport | null; onPrint: () => void }) {
  const [words, setWords] = useState<Words | null>(null);
  useEffect(() => {
    let active = true;
    void restoreAutosave<Words>("student", `monthly-report:${month}`).then((waiting) => {
      if (active) setWords(waiting ?? { summary: saved?.summary ?? "", highlights: saved?.highlights ?? "" });
    });
    return () => {
      active = false;
    };
    // Once per month opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const save = useAutosave<Words>({
    role: "student",
    key: studentId ? `monthly-report:${month}` : null,
    value: words ?? { summary: "", highlights: "" },
    enabled: words !== null,
    save: async (value) => {
      await traineeRecord.saveMonth(studentId, month, value);
    },
  });

  if (!words) return <SkeletonRows rows={2} />;
  return (
    <section className="rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--role-hairline) px-4 py-3 sm:px-5">
        <h3 className="text-[15px] font-extrabold text-slate-900">In your own words</h3>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-slate-600" aria-live="polite">
            {saveStateText(save.state, save.message) || "Saves as you type"}
          </span>
          <Button variant="secondary" size="sm" icon="printer" onClick={onPrint}>
            Print
          </Button>
        </div>
      </div>
      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        {(
          [
            ["summary", "Summary of the month", "What the month was about: your main work and how you grew."],
            ["highlights", "Highlights", "The moments worth keeping for your narrative report."],
          ] as const
        ).map(([field, label, hint]) => (
          <div key={field}>
            <label htmlFor={`month-${field}`} className="text-[14.5px] font-bold text-slate-900">
              {label}
            </label>
            <p className="text-[12.5px] text-slate-600">{hint}</p>
            <textarea
              id={`month-${field}`}
              rows={6}
              maxLength={5000}
              value={words[field]}
              onChange={(event) => setWords((current) => (current ? { ...current, [field]: event.target.value } : current))}
              className="field mt-2 resize-y"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
