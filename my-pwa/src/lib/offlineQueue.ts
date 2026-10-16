import { API_URL, withStudentAuth } from "./api";
import { notifyDataChanged } from "./navCounts";
import { dequeue, enqueue, queued, requeue } from "./offlineStore";
import { cue } from "./cues";
import { toast } from "./toast";

/*
|--------------------------------------------------------------------------
| ATTENDANCE STEPS TAKEN OFFLINE
|--------------------------------------------------------------------------
|
| Out for lunch, back from lunch and time-out still work with no connection: the step
| is kept on the phone with the time the button was pressed, and sent when
| the connection is back. The server checks the time (not in the future,
| not too old, in order) and marks the log as recorded offline, so the
| supervisor sees it when reviewing. Each step carries an id of its own, so
| sending it twice records it once.
|
| Time-in can be kept too, when there is no connection at all. The camera
| check needs the server, so a time-in recorded this way has no photo: the
| server marks it, and the supervisor confirms it by itself. Until it has
| been sent the day has no log on the server, so the steps taken after it
| are kept against LOCAL_LOG_ID and are given the real log's id the moment
| the time-in is accepted. If the server answers that the day already has
| a log (the supervisor recorded the time-in in person meanwhile), the
| waiting steps go to that log instead.
|
| The queue is sent when the app starts, when the phone reports that it is
| online again, and when the app is brought back to the front. If an
| attempt cannot get through it is repeated (after 3 seconds, then 6, 12,
| and so on up to once a minute) for as long as steps are waiting. Background
| Sync is not used: it would run in the service worker, which cannot read
| the sign-in token, and keeping the token where the worker could read it
| would widen who can reach it.
|
*/

export type StepPath = "break" | "break-end" | "time-out";

/** Anything that can wait in the queue: a step on a log, or the time-in that starts one. */
export type QueuedPath = StepPath | "time-in";

/** The id a log has on this phone before the server has given it one. */
export const LOCAL_LOG_ID = -1;

export type QueuedStep = {
  logId: number;
  path: QueuedPath;
  occurredAt: string;
  requestId: string;
  /** Anything else the step carries: at time-out, the accomplishment note and the tasks worked on. */
  extra?: Record<string, unknown>;
};

/** Sent to the pages that show attendance, so they reload after a step is sent. */
export const QUEUE_CHANGED = "internet-offline-queue";

const STEP_NAMES: Record<QueuedPath, string> = {
  "time-in": "time-in",
  break: "\"Out for lunch\"",
  "break-end": "\"Back from lunch\"",
  "time-out": "time-out",
};

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers: sixteen random bytes as hex.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Keeps a time-in recorded with no connection. Returns it, or null when
 * this browser cannot keep it or one is already waiting.
 */
export async function queueTimeIn(note: string): Promise<QueuedStep | null> {
  if ((await waitingSteps()).some((step) => step.path === "time-in")) return null;
  return queueStep(LOCAL_LOG_ID, "time-in", note.trim() ? { note: note.trim() } : undefined);
}

/** Keeps a step for later. Returns it, or null when this browser cannot keep it. */
export async function queueStep(
  logId: number,
  path: QueuedPath,
  extra?: Record<string, unknown>
): Promise<QueuedStep | null> {
  const step: QueuedStep = {
    logId,
    path,
    occurredAt: new Date().toISOString(),
    requestId: requestId(),
    ...(extra ? { extra } : {}),
  };
  try {
    const id = await enqueue("student", step);
    return id === null ? null : step;
  } catch {
    return null;
  }
}

/** The signed-in student's steps still waiting to be sent, oldest first. */
export async function waitingSteps(): Promise<QueuedStep[]> {
  try {
    return (await queued<QueuedStep>("student")).map((row) => row.data);
  } catch {
    return [];
  }
}

let sending: Promise<void> | null = null;
let retryTimer = 0;
let retryDelay = 0;

// A phone says it is "online" the moment it joins a network, often a few
// seconds before a request can actually get through. So one attempt is not
// enough: while steps are still waiting, keep trying, a little less often
// each time, until they are sent.
const RETRY_FIRST_MS = 3_000;
const RETRY_MAX_MS = 60_000;

function retryLater(): void {
  window.clearTimeout(retryTimer);
  retryDelay = retryDelay ? Math.min(retryDelay * 2, RETRY_MAX_MS) : RETRY_FIRST_MS;
  retryTimer = window.setTimeout(() => {
    if (localStorage.getItem("student_token")) void sendWaitingSteps();
  }, retryDelay);
}

/** Sends the waiting steps in order. Safe to call at any time, any number of times. */
export function sendWaitingSteps(): Promise<void> {
  sending ??= send()
    .then((outcome) => {
      if (outcome === "waiting") {
        retryLater();
      } else {
        window.clearTimeout(retryTimer);
        retryDelay = 0;
      }
    })
    .finally(() => {
      sending = null;
    });
  return sending;
}

/** "done" when nothing is left to send; "waiting" when something still is. */
async function send(): Promise<"done" | "waiting"> {
  let rows;
  try {
    rows = await queued<QueuedStep>("student");
  } catch {
    return "done";
  }
  if (rows.length === 0) return "done";
  // The phone's own "offline" is believed; its "online" is tested by trying.
  if (!navigator.onLine) return "waiting";

  let stillWaiting = false;
  let sent = 0;
  const refused: string[] = [];
  // The id the server gave the log a waiting time-in started, once it has one.
  let startedLog: number | null = null;
  // Set when a waiting time-in was refused with no log to fall back on.
  let nothingToAttachTo = false;
  for (const row of rows) {
    let step = row.data;
    if (step.logId === LOCAL_LOG_ID && step.path !== "time-in") {
      // Its time-in was refused for good: there is no log for this step.
      if (nothingToAttachTo) {
        await dequeue(row.id).catch(() => {});
        continue;
      }
      // Its time-in has not been accepted yet in this round: it goes on waiting.
      if (startedLog === null) {
        stillWaiting = true;
        break;
      }
      step = { ...step, logId: startedLog };
    }
    const timeIn = step.path === "time-in";
    let response: Response;
    try {
      response = await fetch(
        timeIn
          ? `${API_URL}/api/attendance/offline-time-in`
          : `${API_URL}/api/attendance/${step.logId}/${step.path}`,
        withStudentAuth({
          method: timeIn ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(step.extra ?? {}),
            occurred_at: step.occurredAt,
            client_request_id: step.requestId,
            // This phone's clock now, so the server can tell how far it is off.
            client_sent_at: new Date().toISOString(),
          }),
        })
      );
    } catch {
      // No connection yet: keep this step and everything after it, and try again.
      stillWaiting = true;
      break;
    }
    // The server is having trouble: try again.
    if (response.status >= 500) {
      stillWaiting = true;
      break;
    }
    // The session has ended: the steps wait for the next sign-in on this phone.
    if (response.status === 401 || response.status === 403) {
      // Not the session: the privacy notice has not been agreed to yet.
      const body = (await response.clone().json().catch(() => ({}))) as { code?: unknown };
      if (timeIn && body.code === "CONSENT_REQUIRED") {
        toast.info(
          "Your time-in is still waiting on this phone. Agree to the privacy notice in your Profile and it will be sent."
        );
      }
      break;
    }

    const data = (await response.json().catch(() => ({}))) as {
      message?: unknown;
      attendance?: { id?: unknown };
    };
    if (timeIn) {
      // Accepted, or the day already had a log: either way the day's log has
      // an id now, and the steps waiting behind this time-in belong to it.
      const logId = Number(data.attendance?.id);
      if (Number.isInteger(logId) && logId > 0) {
        startedLog = logId;
        // Written down as well, in case the round stops before they are sent.
        for (const later of rows) {
          if (later.id !== row.id && later.data.logId === LOCAL_LOG_ID) {
            await requeue(later.id, { ...later.data, logId }).catch(() => {});
          }
        }
      } else {
        nothingToAttachTo = true;
      }
    }
    await dequeue(row.id).catch(() => {});
    if (response.ok) {
      sent += 1;
    } else {
      // Refused for good (too old, out of order, already recorded another way).
      refused.push(
        `Your ${STEP_NAMES[step.path]} recorded offline was not added. ${
          typeof data.message === "string" ? data.message : ""
        }`.trim()
      );
    }
  }

  if (sent > 0) {
    cue("sent");
    toast.success(
      sent === 1
        ? "The step you recorded offline has been sent."
        : `The ${sent} steps you recorded offline have been sent.`
    );
  }
  if (refused.length > 0) cue("refused");
  for (const message of refused) toast.error(message);
  if (sent > 0 || refused.length > 0) {
    window.dispatchEvent(new Event(QUEUE_CHANGED));
    notifyDataChanged();
  }
  return stillWaiting ? "waiting" : "done";
}

/** Starts watching for the moments when waiting steps can be sent. Call once. */
export function watchOfflineQueue(): void {
  const attempt = () => {
    if (localStorage.getItem("student_token")) void sendWaitingSteps();
  };
  window.addEventListener("online", () => {
    // Start the waits over: a connection has just come back.
    retryDelay = 0;
    attempt();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") attempt();
  });
  // Signed in again: send what waited while the session was over.
  window.addEventListener("internet-auth-changed", attempt);
  attempt();
}
