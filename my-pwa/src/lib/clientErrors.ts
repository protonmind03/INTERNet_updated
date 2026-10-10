import { API_URL } from "./api";

/*
|--------------------------------------------------------------------------
| CRASH REPORTS
|--------------------------------------------------------------------------
|
| When a page crashes, the server is told what broke and where, so the fault
| is seen without anyone having to describe it. The report is the error's
| message and stack, the page's path (no query string) and the app version.
| It carries no token and nothing about the person; the server keeps only
| those four fields.
|
*/

const MAX_REPORTS = 3;
let sent = 0;

export function reportClientError(error: unknown, componentStack?: string | null): void {
  // A broken page can throw again and again; a few reports say enough.
  if (sent >= MAX_REPORTS) return;
  sent += 1;

  const known = error instanceof Error ? error : new Error(String(error));
  const stack = [known.stack, componentStack].filter(Boolean).join("\n").slice(0, 4000);

  try {
    void fetch(`${API_URL}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: known.message.slice(0, 500) || known.name,
        stack,
        route: window.location.pathname,
        version: __APP_VERSION__,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Reporting must never add a second error to the first. */
  }
}
