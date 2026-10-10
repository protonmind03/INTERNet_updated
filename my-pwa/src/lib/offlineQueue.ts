import { API_URL, withStudentAuth } from "./api";
import { notifyDataChanged } from "./navCounts";
import { dequeue, enqueue, queued } from "./offlineStore";
import { toast } from "./toast";

/*
|--------------------------------------------------------------------------
| ATTENDANCE STEPS TAKEN OFFLINE
|--------------------------------------------------------------------------
|
| Break, back-to-work and time-out still work with no connection: the step
| is kept on the phone with the time the button was pressed, and sent when
| the connection is back. The server checks the time (not in the future,
| not too old, in order) and marks the log as recorded offline, so the
| supervisor sees it when reviewing. Each step carries an id of its own, so
| sending it twice records it once.
|
| Time-in is not queued. It needs the camera check, which needs the server.
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

export type QueuedStep = {
  logId: number;
  path: StepPath;
  occurredAt: string;
  requestId: string;
};

/** Sent to the pages that show attendance, so they reload after a step is sent. */
export const QUEUE_CHANGED = "internet-offline-queue";

const STEP_NAMES: Record<StepPath, string> = {
  break: "break",
  "break-end": "return from break",
  "time-out": "time-out",
};

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers: sixteen random bytes as hex.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Keeps a step for later. Returns it, or null when this browser cannot keep it. */
export async function queueStep(logId: number, path: StepPath): Promise<QueuedStep | null> {
  const step: QueuedStep = {
    logId,
    path,
    occurredAt: new Date().toISOString(),
    requestId: requestId(),
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
  for (const row of rows) {
    const step = row.data;
    let response: Response;
    try {
      response = await fetch(
        `${API_URL}/api/attendance/${step.logId}/${step.path}`,
        withStudentAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            occurred_at: step.occurredAt,
            client_request_id: step.requestId,
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
    // Signed out: the steps wait for the next sign-in on this phone.
    if (response.status === 401 || response.status === 403) break;

    await dequeue(row.id).catch(() => {});
    if (response.ok) {
      sent += 1;
    } else {
      // Refused for good (too old, out of order, already recorded another way).
      const data = (await response.json().catch(() => ({}))) as { message?: unknown };
      refused.push(
        `Your ${STEP_NAMES[step.path]} recorded offline was not added. ${
          typeof data.message === "string" ? data.message : ""
        }`.trim()
      );
    }
  }

  if (sent > 0) {
    toast.success(
      sent === 1
        ? "The step you recorded offline has been sent."
        : `The ${sent} steps you recorded offline have been sent.`
    );
  }
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
  attempt();
}
