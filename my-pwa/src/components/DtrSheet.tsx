import { Fragment, useMemo, useState } from "react";
import { Button, Card } from "./ui";
import { formatHours, formatLongDate, formatTime } from "../lib/format";
import { timeColumns } from "../lib/timeColumns";
import { errorText, toast } from "../lib/toast";
import { formatPh, phCalendarDate } from "../lib/phTime";
import type { OfflineRole } from "../lib/offlineStore";
import { DtrHeader, PrintPreviewFrame, SignatureMark, TraineeDetails } from "./DtrHeader";
import { useSignatureImage, useTimeRecordHeader } from "../lib/timeRecordHeader";

export type DtrLog = {
  id: number;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  status: string;
  /** What the student wrote at time-out about the day's work. */
  accomplishments?: string | null;
  /** The tasks the student said they worked on that day. */
  tasks?: { id: number; title: string }[];
};

/** True when a day has a line of its own under its times: a note, or tasks worked on. */
const hasNote = (log: DtrLog | undefined) =>
  Boolean(log && (log.accomplishments || (log.tasks && log.tasks.length > 0)));

export type DtrAbsence = { date: string; status: string };

export type DtrHoliday = { date: string; name: string };

/** A month the supervisor has certified. */
export type DtrCertified = {
  id: number;
  month: string;
  certified_by_name: string;
  verified_hours: number;
  certified_at: string;
  /** The trainee's signature when the month was certified (migration 067). */
  trainee_signature_id?: number | null;
};

export type DtrPerson = {
  name: string;
  studentId: string;
  program?: string | null;
  company?: string | null;
  supervisor?: string | null;
};

/**
 * A day's four time cells. A day worked straight through has one cell
 * across AM Out and PM In that says so, instead of two made-up times.
 */
function TimeCells({ log }: { log: DtrLog | undefined }) {
  const cell = "tabular whitespace-nowrap px-2 py-1.5";
  if (!log) {
    return (
      <>
        <td className={cell} />
        <td className={cell} />
        <td className={cell} />
        <td className={cell} />
      </>
    );
  }
  const columns = timeColumns(log);
  const shown = (value: string | null) => (value ? formatTime(value) : "");
  return (
    <>
      <td className={cell}>{shown(columns.amIn)}</td>
      {columns.noBreak ? (
        <td colSpan={2} className={`${cell} text-center text-slate-600`}>
          No break
        </td>
      ) : (
        <>
          <td className={cell}>{shown(columns.amOut)}</td>
          <td className={cell}>{shown(columns.pmIn)}</td>
        </>
      )}
      <td className={cell}>{shown(columns.pmOut)}</td>
    </>
  );
}

/** "2026-10" for a date key or timestamp. */
const monthOf = (date: string) => String(date).slice(0, 7);

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return formatPh(phCalendarDate(year, index, 1), {
    month: "long",
    year: "numeric",
  });
}

/**
 * A Daily Time Record for one month: every day of the month as a row, its
 * times in the four columns the Civil Service form uses (AM In, AM Out, PM
 * In, PM Out), and signature lines. Which time goes in which column, and
 * what is printed for a day with no lunch, is decided by lib/timeColumns.ts:
 * a time that did not happen is never printed. Built to be printed; the
 * portal's own chrome is hidden in print, leaving just this sheet.
 */
export default function DtrSheet({
  person,
  logs,
  absences = [],
  holidays = [],
  certifications = [],
  onCertify,
  onWithdraw,
  loading,
  viewer,
}: {
  /**
   * Who is reading, for the header, details and signature from the server
   * (Iteration 20). Without it the sheet prints only what it is given.
   */
  viewer?: OfflineRole;
  person: DtrPerson;
  logs: DtrLog[];
  /** Absences the student filed, shown on the days they cover. */
  absences?: DtrAbsence[];
  /** Days nobody was expected to report, named on the days they fall. */
  holidays?: DtrHoliday[];
  /** Months the supervisor has certified; the one shown is printed on the sheet. */
  certifications?: DtrCertified[];
  /** Given on the supervisor's copy: certifies the month shown. */
  onCertify?: (month: string) => Promise<void>;
  /** Given on the supervisor's copy: withdraws a certification. */
  onWithdraw?: (id: number) => Promise<void>;
  loading: boolean;
}) {
  const months = useMemo(() => {
    const found = new Set(logs.map((log) => monthOf(log.date)));
    const now = new Date();
    found.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    return [...found].sort().reverse();
  }, [logs]);

  // Read again whenever the logs change, so an attendance change shows in the details at once.
  const header = useTimeRecordHeader(viewer ?? "student", viewer ? person.studentId : undefined, logs);
  const [chosen, setChosen] = useState("");
  const month = chosen || months[0];

  const rows = useMemo(() => {
    const [year, index] = month.split("-").map(Number);
    const days = new Date(year, index, 0).getDate();
    const byDate = new Map(logs.map((log) => [String(log.date).slice(0, 10), log]));
    const absentOn = new Map(
      absences.map((absence) => [String(absence.date).slice(0, 10), absence.status])
    );
    const holidayOn = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));
    return Array.from({ length: days }, (_, offset) => {
      const day = offset + 1;
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const weekday = formatPh(phCalendarDate(year, index, day), {
        weekday: "short",
      });
      const log = byDate.get(key);
      // A day with a log is not an absence, whatever was filed, unless the
      // log was rejected: a day closed as absent because a rejected time-in
      // photo was not retaken keeps its log and has an Unexcused absence. A
      // holiday someone worked keeps its log and is still named.
      return {
        key,
        day,
        weekday,
        log,
        absence: log && log.status !== "Rejected" ? undefined : absentOn.get(key),
        holiday: holidayOn.get(key),
      };
    });
  }, [logs, absences, holidays, month]);

  const verified = rows.reduce(
    (sum, row) => sum + (row.log?.status === "Verified" ? Number(row.log.hours) || 0 : 0),
    0
  );
  const unverified = rows.reduce(
    (sum, row) =>
      sum + (row.log && row.log.status !== "Verified" ? Number(row.log.hours) || 0 : 0),
    0
  );
  const daysPresent = rows.filter((row) => row.log && !row.absence).length;
  const excused = rows.filter((row) => row.absence === "Excused").length;
  const unexcused = rows.filter((row) => row.absence === "Unexcused").length;
  const holidayCount = rows.filter((row) => row.holiday).length;

  const certified = certifications.find((item) => item.month === month);
  // A certified month prints the signature it was certified with; otherwise the one saved now.
  const signature = useSignatureImage(
    viewer ?? "student",
    viewer ? person.studentId : undefined,
    certified ? certified.trainee_signature_id : header?.signature?.id
  );
  // A month can be certified once it has a log and none is open or undecided.
  const unsettled = rows.filter(
    (row) => row.log && (row.log.status === "Pending" || !row.log.time_out)
  ).length;
  const [certifying, setCertifying] = useState(false);
  const runCertification = async (work: () => Promise<void>) => {
    setCertifying(true);
    try {
      await work();
    } catch (certifyError) {
      toast.error(errorText(certifyError, "The time record could not be updated."));
    } finally {
      setCertifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Month
          <select
            value={month}
            onChange={(event) => setChosen(event.target.value)}
            className="field w-auto"
          >
            {months.map((option) => (
              <option key={option} value={option}>
                {monthLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <Button icon="printer" onClick={() => window.print()} disabled={loading}>
          Print
        </Button>
        <p className="text-sm text-slate-500">
          In the print dialog you can also choose "Save as PDF".
        </p>
      </div>

      {onCertify && !loading && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 print:hidden">
          {certified ? (
            <>
              <p className="min-w-0 flex-1 text-sm text-slate-700">
                You certified {monthLabel(month)} on {formatLongDate(certified.certified_at)}.
              </p>
              {onWithdraw && (
                <Button
                  variant="secondary"
                  size="sm"
                  busy={certifying}
                  onClick={() => void runCertification(() => onWithdraw(certified.id))}
                >
                  Withdraw certification
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm text-slate-700">
                {daysPresent === 0
                  ? `There are no logs in ${monthLabel(month)} to certify.`
                  : unsettled > 0
                    ? `${unsettled} ${unsettled === 1 ? "log is" : "logs are"} still open or waiting for your decision. Settle ${unsettled === 1 ? "it" : "them"} to certify this month.`
                    : `Every log in ${monthLabel(month)} is settled. Certifying puts your name and the date on the printed record.`}
              </p>
              <Button
                size="sm"
                icon="check"
                disabled={daysPresent === 0 || unsettled > 0}
                busy={certifying}
                onClick={() => void runCertification(() => onCertify(month))}
              >
                Certify this month
              </Button>
            </>
          )}
        </div>
      )}

      <PrintPreviewFrame>
      <Card className="p-5 sm:p-8 print:border-0 print:p-0">
        <DtrHeader data={header} monthLabel={monthLabel(month)} />

        <TraineeDetails
          data={header}
          fallback={person}
          certificationLine={
            certified
              ? `Certified correct by ${certified.certified_by_name} on ${formatLongDate(certified.certified_at)}`
              : null
          }
        />

        <div className="relative mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Time record table">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-slate-300 text-xs text-slate-600">
                <th scope="col" className="py-2 pr-2 font-semibold">Day</th>
                <th scope="col" className="px-2 py-2 font-semibold">AM In</th>
                <th scope="col" className="px-2 py-2 font-semibold">AM Out</th>
                <th scope="col" className="px-2 py-2 font-semibold">PM In</th>
                <th scope="col" className="px-2 py-2 font-semibold">PM Out</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Hours</th>
                <th scope="col" className="py-2 pl-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                <tr
                  className={`${hasNote(row.log) ? "" : "border-b border-slate-200"} ${
                    row.log || row.absence || row.holiday ? "" : "text-slate-500"
                  }`}
                >
                  <td className="tabular whitespace-nowrap py-1.5 pr-2">
                    {String(row.day).padStart(2, "0")}{" "}
                    <span className="text-slate-500">{row.weekday}</span>
                  </td>
                  <TimeCells log={row.log} />
                  <td className="tabular whitespace-nowrap px-2 py-1.5 text-right">
                    {row.log && row.log.hours !== null ? formatHours(row.log.hours) : ""}
                  </td>
                  <td className="py-1.5 pl-2">
                    {row.holiday && (
                      <span className="block text-slate-600">Holiday: {row.holiday}</span>
                    )}
                    {(row.log && row.absence === "Unexcused" ? "Rejected, absent (unexcused)" : row.log?.status) ||
                      (row.holiday
                        ? ""
                        : row.absence === "Excused"
                        ? "Absent, excused"
                        : row.absence === "Unexcused"
                          ? "Absent, unexcused"
                          : row.absence
                            ? "Absence filed"
                            : "")}
                  </td>
                </tr>
                {row.log && hasNote(row.log) && (
                  <tr className="border-b border-slate-200">
                    <td />
                    <td colSpan={6} className="px-2 pb-1.5 text-[11px] leading-snug text-slate-600">
                      {row.log.accomplishments}
                      {row.log.tasks && row.log.tasks.length > 0 && (
                        <span className="block">
                          <span className="font-semibold">Tasks worked on:</span>{" "}
                          {row.log.tasks.map((task) => task.title).join("; ")}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-slate-900">
                <td colSpan={5} className="py-2.5 pr-2 text-right">
                  Verified hours this month
                </td>
                <td className="tabular px-2 py-2.5 text-right">{formatHours(verified)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          {daysPresent} {daysPresent === 1 ? "day" : "days"} logged.
          {excused + unexcused > 0 &&
            ` Absences: ${excused} excused, ${unexcused} unexcused.`}
          {holidayCount > 0 &&
            ` ${holidayCount} ${holidayCount === 1 ? "holiday" : "holidays"} this month.`}
          {unverified > 0 &&
            ` ${formatHours(unverified)} more are logged but not verified, and are not counted above.`}
        </p>

        {certified && (
          <p className="mt-4 border-l-2 border-emerald-500 pl-3 text-sm text-slate-800">
            Certified correct by {certified.certified_by_name}, company supervisor, on{" "}
            {formatLongDate(certified.certified_at)}: {formatHours(certified.verified_hours)}{" "}
            verified.
            {Math.abs(certified.verified_hours - verified) > 0.005 &&
              " The verified hours have changed since then."}
          </p>
        )}

        <div className="mt-12 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
          <Signature label="Student trainee" name={header?.trainee.name || person.name} mark={<SignatureMark image={signature} />} trainee />
          <Signature label="Company supervisor" name={header?.trainee.supervisor || person.supervisor || ""} />
        </div>
      </Card>
      </PrintPreviewFrame>
    </div>
  );
}

function Signature({ label, name, mark, trainee = false }: { label: string; name: string; mark?: React.ReactNode; trainee?: boolean }) {
  return (
    <div className="text-center text-sm">
      {mark}
      <p className="min-h-5 font-medium text-slate-900">{name}</p>
      <p className="border-t border-slate-400 pt-1 text-slate-600">
        {trainee ? "Signature over printed name of the trainee" : `${label} · signature over printed name`}
      </p>
    </div>
  );
}
