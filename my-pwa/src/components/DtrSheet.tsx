import { useMemo, useState } from "react";
import { Button, Card } from "./ui";
import { formatHours, formatTime } from "../lib/format";

export type DtrLog = {
  id: number;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  status: string;
};

export type DtrPerson = {
  name: string;
  studentId: string;
  program?: string | null;
  company?: string | null;
  supervisor?: string | null;
};

/** "2026-10" for a date key or timestamp. */
const monthOf = (date: string) => String(date).slice(0, 7);

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

/**
 * A Daily Time Record for one month: every day of the month as a row, the
 * logged times beside it, and signature lines. Built to be printed; the
 * portal's own chrome is hidden in print, leaving just this sheet.
 */
export default function DtrSheet({
  person,
  logs,
  loading,
}: {
  person: DtrPerson;
  logs: DtrLog[];
  loading: boolean;
}) {
  const months = useMemo(() => {
    const found = new Set(logs.map((log) => monthOf(log.date)));
    const now = new Date();
    found.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    return [...found].sort().reverse();
  }, [logs]);

  const [chosen, setChosen] = useState("");
  const month = chosen || months[0];

  const rows = useMemo(() => {
    const [year, index] = month.split("-").map(Number);
    const days = new Date(year, index, 0).getDate();
    const byDate = new Map(logs.map((log) => [String(log.date).slice(0, 10), log]));
    return Array.from({ length: days }, (_, offset) => {
      const day = offset + 1;
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(year, index - 1, day).toLocaleDateString("en-PH", {
        weekday: "short",
      });
      return { key, day, weekday, log: byDate.get(key) };
    });
  }, [logs, month]);

  const verified = rows.reduce(
    (sum, row) => sum + (row.log?.status === "Verified" ? Number(row.log.hours) || 0 : 0),
    0
  );
  const unverified = rows.reduce(
    (sum, row) =>
      sum + (row.log && row.log.status !== "Verified" ? Number(row.log.hours) || 0 : 0),
    0
  );
  const daysPresent = rows.filter((row) => row.log).length;

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

      <Card className="p-5 sm:p-8 print:border-0 print:p-0">
        <div className="text-center">
          <p className="text-sm text-slate-600">Pangasinan State University</p>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Daily Time Record
          </h2>
          <p className="text-sm text-slate-700">On-the-Job Training · {monthLabel(month)}</p>
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          <Line label="Name" value={person.name} />
          <Line label="Student ID" value={person.studentId} />
          <Line label="Program" value={person.program || "—"} />
          <Line label="Company" value={person.company || "—"} />
          {person.supervisor && <Line label="Supervisor" value={person.supervisor} />}
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-slate-300 text-xs text-slate-600">
                <th scope="col" className="py-2 pr-2 font-semibold">Day</th>
                <th scope="col" className="px-2 py-2 font-semibold">Time in</th>
                <th scope="col" className="px-2 py-2 font-semibold">Break</th>
                <th scope="col" className="px-2 py-2 font-semibold">Time out</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Hours</th>
                <th scope="col" className="py-2 pl-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-b border-slate-200 ${row.log ? "" : "text-slate-400"}`}
                >
                  <td className="tabular whitespace-nowrap py-1.5 pr-2">
                    {String(row.day).padStart(2, "0")}{" "}
                    <span className="text-slate-500">{row.weekday}</span>
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-1.5">
                    {row.log ? formatTime(row.log.time_in) : ""}
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-1.5">
                    {row.log?.break_time
                      ? `${formatTime(row.log.break_time)} – ${
                          row.log.break_end_time ? formatTime(row.log.break_end_time) : ""
                        }`
                      : ""}
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-1.5">
                    {row.log?.time_out ? formatTime(row.log.time_out) : ""}
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-1.5 text-right">
                    {row.log && row.log.hours !== null ? formatHours(row.log.hours) : ""}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-2">{row.log?.status || ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-slate-900">
                <td colSpan={4} className="py-2.5 pr-2 text-right">
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
          {unverified > 0 &&
            ` ${formatHours(unverified)} more are logged but not verified, and are not counted above.`}
        </p>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
          <Signature label="Student trainee" name={person.name} />
          <Signature label="Company supervisor" name={person.supervisor || ""} />
        </div>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div className="text-center text-sm">
      <p className="min-h-5 font-medium text-slate-900">{name}</p>
      <p className="border-t border-slate-400 pt-1 text-slate-600">
        {label} · signature over printed name
      </p>
    </div>
  );
}
