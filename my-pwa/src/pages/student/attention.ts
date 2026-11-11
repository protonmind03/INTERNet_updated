import { useCallback, useEffect, useState } from "react";
import type { IconName } from "../../components/Icon";
import { daysUntil, formatDate, formatTime } from "../../lib/format";
import { formatPhDay } from "../../lib/phTime";
import { appealUntil, appealableKinds } from "./appealRules";
import type { AttendanceLog } from "./useAttendance";
import { logDateKey } from "./useAttendance";
import type { OnceDeliverable, WeeklyItem } from "./useDeliverables";

/*
|--------------------------------------------------------------------------
| WHAT NEEDS THE TRAINEE (Today, revisions November 2026)
|--------------------------------------------------------------------------
|
| Every thing the trainee has to act on, each as one item that stays on
| Today until it is done or the trainee hides it. Before, Today showed only
| the first decision that could be appealed and one line for all overdue
| tasks, so dealing with one item could make others drop out of sight while
| still undone; now each is listed, from these sources:
|
|   a time-in photo to retake (today)          now
|   a day left without a time-out              now
|   each decision that can still be appealed   by the appeal's last day
|   each task past due, and each due today     now / today
|   each weekly report returned for changes    now
|   each document rejected, or past its date   now
|
| Hiding (the x on an item) lasts for this session only (sessionStorage):
| the item stays in the bell and is back the next time the app is opened.
| The first hide of a session asks first, saying how soon the item is due
| and why it matters; "Don't ask me again" skips that question for the rest
| of the session and shows "Clear all".
|
*/

export type Urgency = "now" | "today" | "soon";

export type AttentionItem = {
  /** Stable for the same thing, so hiding it keeps it hidden. */
  key: string;
  icon: IconName;
  title: string;
  detail: string;
  urgency: Urgency;
  /** How soon, in words: "Overdue by 2 days", "Appeal closes Nov 10". */
  when: string;
  /** Why it matters, said when the trainee asks to hide it. */
  why: string;
  action: { label: string; to?: string; run?: "missed-time-out" | "retake-photo" };
};

type Task = { id: number; title: string; status: string; due_date: string | null };
type Journal = { id: number; week_start: string; status: string; review_notes?: string | null };

const OPEN_TASK = ["Pending", "In Progress"];

function overdueWords(days: number): string {
  const late = -days;
  return late === 1 ? "Overdue by 1 day" : `Overdue by ${late} days`;
}

export function attentionItems({
  todayLog,
  openPastLog,
  logs,
  tasks,
  journals,
  deliverables,
  weekly,
}: {
  todayLog: AttendanceLog | null | undefined;
  openPastLog: AttendanceLog | null | undefined;
  logs: AttendanceLog[];
  tasks: Task[];
  journals: Journal[];
  deliverables: OnceDeliverable[];
  weekly: WeeklyItem[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (todayLog && todayLog.photo_redo_status === "required" && !todayLog.time_out) {
    items.push({
      key: `photo:${todayLog.id}`,
      icon: "camera",
      title: "Retake your time-in photo",
      detail: todayLog.photo_rejection_reason ? `“${todayLog.photo_rejection_reason}”` : "Your supervisor asked for a new photo",
      urgency: "now",
      when: todayLog.photo_redo_due_at ? `Due by ${formatTime(todayLog.photo_redo_due_at)}` : "Due before End break",
      why: "If no new photo is taken in time, today is marked absent. Your hours keep counting while you work.",
      action: { label: "Retake now", run: "retake-photo" },
    });
  }

  if (openPastLog) {
    items.push({
      key: `missed-out:${openPastLog.id}`,
      icon: "clock",
      title: "Enter your missed time-out",
      detail: `${formatPhDay(logDateKey(openPastLog), { weekday: "long", month: "short", day: "numeric" })} has no time-out`,
      urgency: "now",
      when: "As soon as you can",
      why: "A day without a time-out has no hours yet, so it can't count towards your required hours until it is entered.",
      action: { label: "Enter time-out", run: "missed-time-out" },
    });
  }

  for (const log of logs) {
    if (appealableKinds(log).length === 0) continue;
    if (!(log.status === "Rejected" || log.photo_rejected_at || log.time_corrected_at)) continue;
    const until = appealUntil(log);
    const left = until ? daysUntil(until.toISOString()) : null;
    items.push({
      key: `appeal:${log.id}:${log.status}:${log.time_corrected_at ?? ""}`,
      icon: "flag",
      title: log.status === "Rejected" ? "A day was rejected" : log.photo_rejected_at ? "A time-in photo was rejected" : "Your times were corrected",
      detail: formatPhDay(logDateKey(log), { weekday: "short", month: "short", day: "numeric" }),
      urgency: left !== null && left <= 1 ? "now" : "soon",
      when: until ? `You can appeal until ${formatDate(until.toISOString())}` : "You can still appeal",
      why: "After the appeal period ends the decision stands and the day can no longer be changed.",
      action: { label: "Review", to: "/daily-log?filter=fix" },
    });
  }

  for (const task of tasks) {
    if (!OPEN_TASK.includes(task.status) || !task.due_date) continue;
    const days = daysUntil(task.due_date);
    if (days === null || days > 0) continue;
    items.push({
      key: `task:${task.id}:${task.due_date}`,
      icon: "tasks",
      title: task.title,
      detail: "Task",
      urgency: days < 0 ? "now" : "today",
      when: days < 0 ? overdueWords(days) : "Due today",
      why: "Your supervisor is waiting for this work, and late work can count against your evaluation.",
      action: { label: "Open task", to: "/task" },
    });
  }

  for (const journal of journals) {
    if (journal.status !== "Returned") continue;
    items.push({
      key: `journal:${journal.id}:returned`,
      icon: "note",
      title: "A weekly report was returned",
      detail: journal.review_notes ? `“${journal.review_notes}”` : `Week of ${formatDate(journal.week_start)}`,
      urgency: "now",
      when: "Send it again soon",
      why: "That week's days can't be closed until your supervisor reviews the report again.",
      action: { label: "Edit report", to: "/journal?view=weekly" },
    });
  }

  for (const item of [...deliverables.map((d) => ({ ...d, id: `once:${d.requirement_id}` })), ...weekly.map((w) => ({ ...w, id: `week:${w.item_id}` }))]) {
    const days = daysUntil(item.due_date);
    const rejected = item.status === "Rejected";
    const late = item.status === "Not submitted" && days !== null && days < 0;
    if (!rejected && !late) continue;
    items.push({
      key: `doc:${item.id}:${item.status}`,
      icon: "document",
      title: item.name,
      detail: rejected ? "Document returned: upload a corrected copy" : "Document not submitted yet",
      urgency: "now",
      when: rejected ? "Upload again soon" : days !== null ? overdueWords(days) : "Overdue",
      why: "Missing documents keep your completion checklist open, so your OJT can't be marked complete.",
      action: { label: "Open documents", to: "/documents" },
    });
  }

  const rank: Record<Urgency, number> = { now: 0, today: 1, soon: 2 };
  return items.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/* ---------- Hidden for this session ---------- */

function readSession<T>(name: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSession(name: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(name, JSON.stringify(value));
  } catch {
    // Private mode or storage off: hiding lasts until the page is left.
  }
}

/** Which items are hidden this session, and whether the trainee asked not to be asked again. */
export function useHiddenAttention(owner: string | undefined) {
  const hiddenKey = `inb-attention-hidden:${owner ?? ""}`;
  const askKey = `inb-attention-noask:${owner ?? ""}`;
  const [hidden, setHidden] = useState<string[]>(() => readSession(hiddenKey, []));
  const [noAsk, setNoAsk] = useState<boolean>(() => readSession(askKey, false));

  useEffect(() => {
    writeSession(hiddenKey, hidden);
  }, [hiddenKey, hidden]);
  useEffect(() => {
    writeSession(askKey, noAsk);
  }, [askKey, noAsk]);

  const hide = useCallback((keys: string[]) => setHidden((current) => [...new Set([...current, ...keys])]), []);
  const showAll = useCallback(() => setHidden([]), []);
  return { hidden, hide, showAll, noAsk, setNoAsk };
}
