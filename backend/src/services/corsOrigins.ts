// Which browser origins may call the API (Phase 0.2).
//
// In production only the deployed frontend (FRONTEND_URL, plus any extra
// comma-separated origins in CORS_ORIGINS) may call it. With neither set
// the server refuses to start, the way it does without JWT_SECRET: before,
// it quietly allowed every origin. Development allows every origin, as
// before.

type Env = Record<string, string | undefined>;

/** FRONTEND_URL and CORS_ORIGINS, trimmed, without a trailing slash, empty ones dropped. */
export function allowedOriginsFrom(env: Env): string[] {
  return [env.FRONTEND_URL, ...(env.CORS_ORIGINS || "").split(",")]
    .map((origin) => (origin || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const NO_CORS_ORIGINS_MESSAGE =
  "In production FRONTEND_URL or CORS_ORIGINS must name the frontend's address (for example https://internet.example.edu.ph); the server will not start allowing every origin.";

/**
 * The origins to allow, or null for "every origin" (development only).
 * Throws in production when none is set.
 */
export function requireCorsOrigins(env: Env): string[] | null {
  const origins = allowedOriginsFrom(env);
  if (env.NODE_ENV !== "production") return null;
  if (origins.length === 0) throw new Error(NO_CORS_ORIGINS_MESSAGE);
  return origins;
}
