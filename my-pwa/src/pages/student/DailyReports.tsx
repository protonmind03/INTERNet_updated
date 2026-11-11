import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EntryPictures from "../../components/EntryPictures";
import Icon from "../../components/Icon";
import { Button, ConfirmDialog, ErrorNotice, SkeletonRows } from "../../components/ui";
import { MAX_PICTURES, preparePicture, uploadPicture } from "../../lib/attachments";
import { formatHours, formatTime } from "../../lib/format";
import { keepOnPhone, saveToPhone, usePendingPhotos } from "../../lib/pendingPhotos";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { toast } from "../../lib/toast";
import { traineeRecord, type DailyReport, type ReportEntry } from "../../lib/traineeRecord";
import { restoreAutosave, saveStateText, useAutosave } from "../../lib/useAutosave";
import { useTimeIn } from "./timeInContext";
import { logDateKey, type AttendanceLog } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| DAILY REPORTS (Progress reports, revisions November 2026)
|--------------------------------------------------------------------------
|
| One report for each day, as the trainee chose:
|
|   the week as a strip of days, each marked when it was worked, when it
|   has a report and how many events it holds; the day picked opens below
|
|   the day's report starts from what was written at time-out (shown above
|   it, as recorded) and is the trainee's to change; it saves as they type
|
|   events: "Add an event" whenever something worth reporting happens,
|   each with a time, a title, what happened and up to three photos, taken
|   with INTERNet's camera or chosen from the phone. Photos taken with no
|   connection are kept on the phone and sent later (lib/pendingPhotos.ts)
|
| A day can change until its week's weekly report is reviewed, and a day
| that has not come yet cannot be written.
|
*/

const DAY_MS = 86_400_000;

function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shift(day, -((weekday + 6) % 7));
}

function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export default function DailyReports() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const { attendance } = useTimeIn();
  const [params, setParams] = useSearchParams();
  const today = phToday();
  const asked = params.get("day");
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;
  const week = mondayOf(day);

  const [reports, setReports] = useState<Map<string, DailyReport>>(new Map());
  const [closedWeeks, setClosedWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reloads, setReloads] = useState(0);
  const load = () => setReloads((count) => count + 1);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    traineeRecord
      .dailyReports("student", studentId, week, shift(week, 6))
      .then((data) => {
        if (!active) return;
        setReports(new Map(data.reports.map((report) => [report.report_date, report])));
        setClosedWeeks(data.closed_weeks);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your daily reports.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, week, reloads]);

  const logsByDay = useMemo(() => {
    const map = new Map<string, AttendanceLog>();
    for (const log of attendance.logs) map.set(logDateKey(log), log);
    return map;
  }, [attendance.logs]);

  const pick = (next: string) => {
    const rest = new URLSearchParams(params);
    if (next === today) rest.delete("day");
    else rest.set("day", next);
    setParams(rest, { replace: true });
  };

  const days = Array.from({ length: 7 }, (_, index) => shift(week, index));
  const closed = closedWeeks.includes(week);

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}

      {/* The week, as a strip of days. */}
      <section aria-label="Choose a day" className="rounded-2xl bg-white p-2.5 ring-1 ring-inset ring-(--role-hairline) sm:p-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <button type="button" onClick={() => pick(shift(week, -7))} aria-label="The week before" className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-psu-50">
            <Icon name="chevron-left" size={18} />
          </button>
          <p className="text-[14.5px] font-bold text-slate-900">
            Week of {formatPhDay(week, { month: "long", day: "numeric" })}
            {closed && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11.5px] font-bold text-emerald-900">Reviewed</span>}
          </p>
          <button type="button" onClick={() => pick(shift(week, 7))} disabled={shift(week, 7) > today} aria-label="The week after" className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-psu-50 disabled:opacity-30">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const log = logsByDay.get(date);
            const report = reports.get(date);
            const events = report?.entries.length ?? 0;
            const written = Boolean(report?.summary) || events > 0;
            const future = date > today;
            const on = date === day;
            return (
              <li key={date}>
                <button
                  type="button"
                  disabled={future}
                  onClick={() => pick(date)}
                  aria-current={on ? "date" : undefined}
                  aria-label={`${formatPhDay(date, { weekday: "long", month: "long", day: "numeric" })}${log ? ", worked" : ""}${written ? ", report written" : ""}${events ? `, ${events} events` : ""}`}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-xl py-2 transition-colors disabled:opacity-35 ${
                    on ? "bg-psu-700 text-white shadow-raised" : "text-slate-700 hover:bg-psu-50"
                  }`}
                >
                  <span aria-hidden="true" data-short={formatPhDay(date, { weekday: "short" }).slice(0, 2)} className={`css-label text-[11px] font-bold uppercase ${on ? "text-white/80" : "text-slate-500"}`} />
                  <span className="font-display tabular text-[19px] font-extrabold leading-none">{formatPhDay(date, { day: "numeric" })}</span>
                  <span aria-hidden="true" className="flex h-2 items-center gap-0.5">
                    {log && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-gold-300" : "bg-gold-500"}`} />}
                    {written && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white" : "bg-psu-600"}`} />}
                    {events > 1 && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white/70" : "bg-psu-300"}`} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600" aria-hidden="true">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gold-500" /> Worked</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-psu-600" /> Report written</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-psu-300" /> More than one event</span>
        </p>
      </section>

      {loading || !studentId ? (
        <SkeletonRows rows={4} />
      ) : (
        <DayReport
          key={day}
          studentId={studentId}
          day={day}
          log={logsByDay.get(day) ?? null}
          report={reports.get(day) ?? null}
          closed={closed}
          onChanged={(next) => setReports((current) => new Map(current).set(day, next))}
        />
      )}
    </div>
  );
}

function DayReport({
  studentId,
  day,
  log,
  report,
  closed,
  onChanged,
}: {
  studentId: string;
  day: string;
  log: AttendanceLog | null;
  report: DailyReport | null;
  closed: boolean;
  onChanged: (report: DailyReport) => void;
}) {
  const note = log?.accomplishments?.trim() ?? "";
  const [summary, setSummary] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReportEntry[]>(report?.entries ?? []);
  const [adding, setAdding] = useState(false);
  const latest = useRef(report);
  useEffect(() => {
    latest.current = report;
  });

  // The day's words: what waits on this phone, else what was saved, else the time-out note to start from.
  useEffect(() => {
    let active = true;
    void restoreAutosave<string>("student", `daily-report:${day}`).then((waiting) => {
      if (active) setSummary(waiting ?? report?.summary ?? note);
    });
    return () => {
      active = false;
    };
    // Once per day opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const save = useAutosave<string>({
    role: "student",
    key: closed ? null : `daily-report:${day}`,
    value: summary ?? "",
    enabled: summary !== null,
    // What the server has: a day opened with the time-out note in it is saved as a draft at once.
    start: report?.summary ?? "",
    save: async (value) => {
      const { report: saved } = await traineeRecord.saveDay(studentId, day, value);
      onChanged({ ...(latest.current ?? { entries: [] }), ...saved, entries: latest.current?.entries ?? entries });
    },
  });

  const addEvent = async () => {
    setAdding(true);
    try {
      const { entry } = await traineeRecord.addEntry(studentId, day, { title: "", details: "", happened_at: day === phToday() ? nowTime() : null });
      const next = [...entries, entry];
      setEntries(next);
      onChanged({ ...(latest.current ?? { id: entry.report_id, report_date: day, summary: null, updated_at: entry.created_at }), entries: next } as DailyReport);
    } catch (addError) {
      toast.error(addError instanceof Error ? addError.message : "The event could not be added.");
    } finally {
      setAdding(false);
    }
  };

  const removed = (id: number) => {
    const next = entries.filter((entry) => entry.id !== id);
    setEntries(next);
    if (latest.current) onChanged({ ...latest.current, entries: next });
  };

  const worked = log?.time_in
    ? `${formatTime(log.time_in)}${log.time_out ? ` to ${formatTime(log.time_out)}` : ", not timed out yet"}${log.hours ? ` · ${formatHours(log.hours)}` : ""}`
    : null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--role-hairline) px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[16.5px] font-extrabold text-slate-900">{formatPhDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
            <p className="text-[13px] text-slate-600">{worked ? `Worked ${worked}` : "No time-in on this day"}</p>
          </div>
          <p className="text-[12.5px] text-slate-600" aria-live="polite">
            {closed ? "This week was reviewed, so this day can no longer change." : saveStateText(save.state, save.message) || "Saves as you type"}
          </p>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          {note && (
            <figure className="rounded-xl bg-psu-50 px-3.5 py-2.5 ring-1 ring-inset ring-psu-200/70">
              <figcaption className="text-[11.5px] font-bold uppercase tracking-wide text-psu-800">What you wrote at time-out</figcaption>
              <blockquote className="mt-1 whitespace-pre-line text-[14px] text-slate-800">{note}</blockquote>
            </figure>
          )}
          <div>
            <label htmlFor={`day-summary-${day}`} className="text-[14.5px] font-bold text-slate-900">
              Your report for the day
            </label>
            {summary === null ? (
              <SkeletonRows rows={2} />
            ) : (
              <textarea
                id={`day-summary-${day}`}
                rows={5}
                maxLength={5000}
                value={summary}
                disabled={closed}
                onChange={(event) => setSummary(event.target.value)}
                placeholder={note ? "" : "Write about your day…"}
                className="field mt-2 resize-y"
              />
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby={`events-${day}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`events-${day}`} className="text-[16px] font-extrabold text-slate-900">
            Events {entries.length > 0 && <span className="tabular text-slate-500">· {entries.length}</span>}
          </h3>
          {!closed && (
            <Button icon="plus" busy={adding} onClick={() => void addEvent()}>
              Add an event
            </Button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-psu-200 bg-white/60 px-4 py-5 text-center text-[14px] text-slate-600">
            No events yet.
          </p>
        ) : (
          <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-0.5 before:bg-psu-100">
            {entries.map((entry) => (
              <EventCard key={entry.id} studentId={studentId} day={day} entry={entry} closed={closed} onRemoved={() => removed(entry.id)} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

type EventDraft = { title: string; details: string; happened_at: string };

function EventCard({ studentId, day, entry, closed, onRemoved }: { studentId: string; day: string; entry: ReportEntry; closed: boolean; onRemoved: () => void }) {
  const [draft, setDraft] = useState<EventDraft>({ title: entry.title, details: entry.details, happened_at: entry.happened_at ?? "" });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pictures, setPictures] = useState({ count: entry.pictures, canAdd: !closed, reload: 0 });
  const [sending, setSending] = useState(false);
  const camera = useRef<HTMLInputElement | null>(null);
  const gallery = useRef<HTMLInputElement | null>(null);
  const { photos: waiting } = usePendingPhotos();
  const mine = waiting.filter((photo) => photo.ownerId === entry.id);

  const save = useAutosave<EventDraft>({
    role: "student",
    key: closed ? null : `report-entry:${entry.id}`,
    value: draft,
    save: async (value) => {
      await traineeRecord.saveEntry(studentId, entry.id, { ...value, happened_at: value.happened_at || null });
    },
  });

  const room = Math.max(0, MAX_PICTURES - pictures.count - mine.length);

  const addPhotos = async (files: FileList | null, capturedInApp: boolean) => {
    if (!files || files.length === 0) return;
    setSending(true);
    let kept = 0;
    for (const file of [...files].slice(0, room)) {
      try {
        const prepared = await preparePicture(file);
        const draftPicture = { ...prepared, capturedInApp, takenAt: new Date().toISOString() };
        try {
          if (!navigator.onLine) throw new TypeError("offline");
          await uploadPicture("student", "report_entry", entry.id, draftPicture);
        } catch (uploadError) {
          if (!(uploadError instanceof TypeError)) throw uploadError;
          // No connection: kept on this phone, sent once back online.
          await keepOnPhone({
            owner: "report_entry",
            ownerId: entry.id,
            day,
            file: draftPicture.file,
            thumb: draftPicture.thumb,
            width: draftPicture.width,
            height: draftPicture.height,
            caption: draftPicture.caption,
            ref: draftPicture.ref,
            capturedInApp,
            takenAt: draftPicture.takenAt,
          });
          kept += 1;
        } finally {
          URL.revokeObjectURL(prepared.preview);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "A photo could not be added.");
      }
    }
    if (kept > 0) toast.info(kept === 1 ? "No connection: the photo is saved on this phone and will be sent when you're back online." : `No connection: ${kept} photos are saved on this phone and will be sent when you're back online.`);
    setPictures((current) => ({ ...current, reload: current.reload + 1 }));
    setSending(false);
    for (const input of [camera.current, gallery.current]) if (input) input.value = "";
  };

  const remove = async () => {
    try {
      await traineeRecord.removeEntry(studentId, entry.id);
      onRemoved();
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "The event could not be removed.");
    }
    setConfirmRemove(false);
  };

  return (
    <li className="relative pl-11">
      <span aria-hidden="true" className="absolute left-1.5 top-3 grid h-[24px] w-[24px] place-items-center rounded-full bg-psu-700 text-white ring-4 ring-(--folder-paper)">
        <Icon name="star" size={12} />
      </span>
      <article className="rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-(--role-hairline) sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            aria-label="Time it happened"
            value={draft.happened_at}
            disabled={closed}
            onChange={(event) => setDraft((current) => ({ ...current, happened_at: event.target.value }))}
            className="field w-[8.5rem] py-1.5"
          />
          <input
            type="text"
            aria-label="Event title"
            placeholder="What happened? (e.g. Library reading event)"
            maxLength={160}
            value={draft.title}
            disabled={closed}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="field min-w-0 flex-1 py-1.5 font-semibold"
          />
          {!closed && (
            <button type="button" onClick={() => setConfirmRemove(true)} aria-label="Remove this event" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-700">
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>
        <textarea
          aria-label="What happened, in detail"
          rows={3}
          maxLength={5000}
          placeholder="Your part in it, who was there, what you learned…"
          value={draft.details}
          disabled={closed}
          onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))}
          className="field mt-2 resize-y"
        />

        <EntryPictures
          role="student"
          owner="report_entry"
          ownerId={entry.id}
          count={pictures.reload === 0 ? entry.pictures : undefined}
          reloadKey={pictures.reload}
          onCount={(count, canAdd) => setPictures((current) => (current.count === count && current.canAdd === canAdd ? current : { ...current, count, canAdd }))}
        />

        {mine.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-950 ring-1 ring-inset ring-amber-600/20">
            <p className="font-semibold">
              {mine.length === 1 ? "1 photo is" : `${mine.length} photos are`} saved on this phone, waiting to be sent.
              {mine.some((photo) => photo.failure) ? ` ${mine.find((photo) => photo.failure)?.failure}` : ""}
            </p>
            <button type="button" onClick={() => void saveToPhone(mine)} className="mt-1 inline-flex min-h-11 items-center gap-1 font-bold text-amber-900 underline-offset-2 hover:underline">
              <Icon name="download" size={15} />
              Save {mine.length === 1 ? "a copy" : "copies"} to your phone
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!closed && room > 0 ? (
            <div className="flex flex-wrap gap-2">
              <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void addPhotos(event.target.files, true)} />
              <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void addPhotos(event.target.files, false)} />
              <Button variant="secondary" size="sm" icon="camera" busy={sending} onClick={() => camera.current?.click()}>
                Take a photo
              </Button>
              <Button variant="secondary" size="sm" icon="image" disabled={sending} onClick={() => gallery.current?.click()}>
                From your phone
              </Button>
            </div>
          ) : (
            <span className="text-[12.5px] text-slate-500">{closed ? "" : `Up to ${MAX_PICTURES} photos for each event.`}</span>
          )}
          <span className="text-[12px] text-slate-500" aria-live="polite">
            {saveStateText(save.state, save.message)}
          </span>
        </div>
      </article>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this event?"
        message="It is taken off the day's report. Its photos stay in your album."
        confirmLabel="Remove event"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </li>
  );
}
