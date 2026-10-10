/*
|--------------------------------------------------------------------------
| CLIENT ERROR REPORTS
|--------------------------------------------------------------------------
|
| When a page crashes in someone's browser, the app sends a short report so
| the fault shows up in the server log instead of going unnoticed. Anyone
| can reach the route (a crash can happen before sign-in), so it takes as
| little as possible: four fields, each cut to a fixed length, and nothing
| about who sent it. Whatever else is in the request is ignored.
|
*/

export type ClientErrorRecord = {
  message: string;
  stack: string;
  route: string;
  version: string;
};

const LIMITS = { message: 500, stack: 4000, route: 200, version: 40 };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The four fields that are logged, or null when there is no message. */
export function clientErrorRecord(body: unknown): ClientErrorRecord | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;

  const message = text(input.message, LIMITS.message);
  if (!message) return null;

  // Only the path: a query string can carry a password-reset token.
  const path = text(input.route, 2000).split(/[?#]/)[0].slice(0, LIMITS.route);
  const version = text(input.version, LIMITS.version);

  return {
    message,
    stack: text(input.stack, LIMITS.stack),
    route: path.startsWith("/") ? path : "",
    version: /^[\w.+-]*$/.test(version) ? version : "",
  };
}

/**
 * Counts requests per key in memory and says when a key has had too many.
 * Enough for a route whose only cost is a log line; it resets on restart.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return function allowed(key: string, now = Date.now()): boolean {
    if (windows.size > 5000) {
      for (const [other, entry] of windows) {
        if (now - entry.startedAt >= windowMs) windows.delete(other);
      }
    }
    const entry = windows.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}
