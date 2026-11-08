import { useEffect, useState } from "react";
import { formatDate } from "../lib/format";
import { phToday } from "../lib/phTime";
import { addDays, mondayOf } from "../lib/studentCalendar";
import { FEEDBACK_CHOICES, FEEDBACK_CRITERIA, traineeRecord, type DailyReport, type FeedbackForm, type MonthlyReport } from "../lib/traineeRecord";
import EntryPictures from "./EntryPictures";
import Icon from "./Icon";
import { Card, CardHeader, EmptyState, SkeletonRows } from "./ui";

/*
|--------------------------------------------------------------------------
| A TRAINEE'S REPORTS, AS THE SUPERVISOR AND COORDINATOR SEE THEM (change1108)
|--------------------------------------------------------------------------
|
| What the trainee writes in Reports reaches the people who follow them:
|
|   Daily reports      a week at a time (arrows step back), each day's
|                      report and its events with their photos
|   Monthly reports    each month's summary and highlights, in the
|                      trainee's words
|   Feedback form      the trainee's FM-AA-INT-20 (coordinator only: the
|                      trainee rates the company and the supervisor there,
|                      so the supervisor does not read it)
|
| WeekDailyReports is the week's daily reports alone, shown beside a weekly
| report while the supervisor reviews it.
|
| Read-only; the server allows each viewer only their own trainees
| (backend routes/traineeRecord.ts, mayRead).
|
*/

type Role = "supervisor" | "coordinator";

function DayCard({ role, report }: { role: Role; report: DailyReport }) {
  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-inset ring-slate-200">
      <p className="text-[14px] font-bold text-slate-900">{formatDate(report.report_date)}</p>
      {report.summary ? <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">{report.summary}</p> : <p className="mt-1 text-[13px] italic text-slate-500">No report written for the day.</p>}
      {report.entries.length > 0 && (
        <ul className="mt-2 space-y-2 border-l-2 border-amber-300 pl-3">
          {report.entries.map((entry) => (
            <li key={entry.id}>
              <p className="text-[13.5px] font-semibold text-slate-900">
                {entry.happened_at && <span className="tabular mr-1.5 text-slate-500">{entry.happened_at.slice(0, 5)}</span>}
                {entry.title || "An event"}
              </p>
              {entry.details && <p className="whitespace-pre-wrap text-[13px] text-slate-700">{entry.details}</p>}
              {entry.pictures > 0 && <EntryPictures role={role} owner="report_entry" ownerId={entry.id} count={entry.pictures} className="mt-1.5" />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The daily reports of one week (Monday to Sunday). */
export function WeekDailyReports({ role, studentId, weekStart, title = "Daily reports this week" }: { role: Role; studentId: string; weekStart: string; title?: string }) {
  const [reports, setReports] = useState<DailyReport[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    traineeRecord
      .dailyReports(role, studentId, weekStart, addDays(weekStart, 6))
      .then((data) => {
        if (active) setReports(data.reports.filter((report) => report.summary || report.entries.length).sort((a, b) => a.report_date.localeCompare(b.report_date)));
      })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Could not load the daily reports."));
    return () => {
      active = false;
    };
  }, [role, studentId, weekStart]);

  return (
    <section aria-label={title} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <h3 className="mb-2 flex items-center gap-2 text-[14px] font-extrabold text-slate-900">
        <Icon name="calendar" size={16} />
        {title}
        {reports && <span className="tabular text-[12.5px] font-semibold text-slate-500">{reports.length}</span>}
      </h3>
      {error ? (
        <p className="text-[13px] text-red-700">{error}</p>
      ) : reports === null ? (
        <SkeletonRows rows={2} />
      ) : reports.length === 0 ? (
        <p className="text-[13px] text-slate-600">No daily report written that week.</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <DayCard key={report.id} role={role} report={report} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackFormView({ studentId }: { studentId: string }) {
  const [form, setForm] = useState<FeedbackForm | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    traineeRecord
      .feedbackForm("coordinator", studentId)
      .then((data) => active && setForm(data.form))
      .catch(() => active && setForm(null));
    return () => {
      active = false;
    };
  }, [studentId]);
  if (form === undefined) return <SkeletonRows rows={3} />;
  if (!form || !form.submitted_at)
    return <EmptyState icon="clipboard" title={form ? "Started, not sent yet" : "Not filled in yet"} description="The trainee fills in FM-AA-INT-20 in their Resolution Center." />;
  return (
    <div className="space-y-3 px-4 pb-4 sm:px-5">
      <p className="text-[13px] text-slate-600">Sent {formatDate(form.submitted_at)}</p>
      <table className="w-full text-[13.5px]">
        <tbody className="divide-y divide-slate-100">
          {FEEDBACK_CRITERIA.map((criterion) => {
            const rating = form.ratings[criterion.key];
            return (
              <tr key={criterion.key}>
                <td className="py-2 pr-3 text-slate-800">{criterion.text}</td>
                <td className="tabular w-40 py-2 text-right font-semibold text-slate-900">{FEEDBACK_CHOICES.find((choice) => choice.value === rating)?.short ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {form.problems_met && (
        <p className="text-[13.5px] text-slate-700">
          <b className="text-slate-900">Problems met: </b>
          {form.problems_met}
        </p>
      )}
      {form.other_concerns && (
        <p className="text-[13.5px] text-slate-700">
          <b className="text-slate-900">Other concerns: </b>
          {form.other_concerns}
        </p>
      )}
    </div>
  );
}

export default function TraineeReportsView({ role, studentId }: { role: Role; studentId: string }) {
  const [week, setWeek] = useState(() => mondayOf(phToday()));
  const [months, setMonths] = useState<MonthlyReport[] | null>(null);
  useEffect(() => {
    let active = true;
    traineeRecord
      .monthlyReports(role, studentId)
      .then((data) => active && setMonths(data.months.filter((month) => month.summary || month.highlights)))
      .catch(() => active && setMonths([]));
    return () => {
      active = false;
    };
  }, [role, studentId]);
  const thisWeek = mondayOf(phToday());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon="calendar" title="Daily reports" description="What the trainee wrote each day, with the events and photos." />
        <div className="space-y-3 px-4 pb-4 sm:px-5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWeek((value) => addDays(value, -7))} aria-label="The week before" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
              <Icon name="chevron-left" size={17} />
            </button>
            <p className="min-w-0 flex-1 text-center text-[14px] font-bold text-slate-900">
              {week === thisWeek ? "This week" : `Week of ${formatDate(week)}`}
            </p>
            <button type="button" onClick={() => setWeek((value) => addDays(value, 7))} disabled={week >= thisWeek} aria-label="The week after" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30">
              <Icon name="chevron-right" size={17} />
            </button>
          </div>
          <WeekDailyReports key={week} role={role} studentId={studentId} weekStart={week} title={week === thisWeek ? "This week" : `Week of ${formatDate(week)}`} />
        </div>
      </Card>

      <Card>
        <CardHeader icon="chart" title="Monthly reports" description="Each month in the trainee's own words." />
        {months === null ? (
          <SkeletonRows rows={2} />
        ) : months.length === 0 ? (
          <EmptyState icon="chart" title="No monthly report yet" />
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {months.map((month) => (
              <li key={month.id} className="px-4 py-3 sm:px-5">
                <p className="text-[14px] font-bold text-slate-900">{new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${month.month.slice(0, 10)}T12:00:00+08:00`))}</p>
                {month.summary && <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-slate-700">{month.summary}</p>}
                {month.highlights && (
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-slate-700">
                    <b className="text-slate-900">Highlights: </b>
                    {month.highlights}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {role === "coordinator" && (
        <Card>
          <CardHeader icon="clipboard" title="Student intern's feedback form (FM-AA-INT-20)" description="How the trainee rates their training and the company." />
          <FeedbackFormView studentId={studentId} />
        </Card>
      )}
    </div>
  );
}
