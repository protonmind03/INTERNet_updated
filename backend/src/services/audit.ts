import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| AUDIT LOG
|--------------------------------------------------------------------------
|
| A record of who did what, for the actions that decide or change someone
| else's record. The list of those actions is the table below: one line per
| route. A piece of middleware watches every request; when one of these
| routes answers with success, it writes one row. The route handlers do not
| know about it, so a route cannot forget to log, and a failure to log can
| never fail the request.
|
| What goes into `details` is named field by field. Nothing else from the
| request is kept, so a password or a file can never end up in the log.
|
*/

export type AuditEntry = {
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
};

type Source = {
  params: Record<string, string | undefined>;
  body: Record<string, unknown>;
  /** What the route answered with. */
  result: Record<string, unknown>;
};

type Rule = {
  method: string;
  /** The route's pattern, as written in app.<method>(...). */
  path: string;
  /** A fixed action name, or one chosen from the request. */
  action: string | ((source: Source) => string | null);
  entityType: string | ((source: Source) => string);
  entityId: (source: Source) => unknown;
  /** Request fields worth keeping. */
  keep?: string[];
  /** Facts taken from the answer. */
  from?: (source: Source) => Record<string, unknown>;
};

const param = (name: string) => (source: Source) => source.params[name];
const nested = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** "Verified" / "Rejected" / "Pending" (a withdrawn decision) to an action name. */
function decision(prefix: string, field = "status") {
  return (source: Source): string | null => {
    const status = String(source.body[field] ?? "").toLowerCase();
    if (!status) return null;
    if (status === "pending") return `${prefix}.undo`;
    if (status === "verified" || status === "approved" || status === "reviewed" || status === "excused") {
      return `${prefix}.approve`;
    }
    return `${prefix}.${status.replace(/[^a-z]+/g, "_")}`;
  };
}

export const AUDIT_RULES: Rule[] = [
  // Attendance
  {
    method: "PATCH",
    path: "/api/attendance/:id/status",
    action: decision("attendance"),
    entityType: "attendance",
    entityId: param("id"),
    keep: ["status", "reason"],
  },
  {
    method: "POST",
    path: "/api/coordinator/attendance/:id/acknowledge",
    action: "attendance.acknowledge",
    entityType: "attendance",
    entityId: param("id"),
  },
  {
    method: "POST",
    path: "/api/supervisor/attendance/record",
    action: "attendance.record_time_in",
    entityType: "attendance",
    entityId: (source) => nested(source.result.attendance, "id"),
    keep: ["student_id", "reason"],
  },
  // Tasks, documents, absences
  {
    method: "PATCH",
    path: "/api/tasks/:id/review",
    action: decision("task"),
    entityType: "task",
    entityId: param("id"),
    keep: ["status", "review_notes"],
  },
  {
    method: "POST",
    path: "/api/tasks/:id/review/undo",
    action: "task.undo",
    entityType: "task",
    entityId: param("id"),
  },
  {
    method: "PATCH",
    path: "/api/documents/:documentId/review",
    action: decision("document"),
    entityType: "document",
    entityId: param("documentId"),
    keep: ["status", "review_notes"],
  },
  {
    method: "POST",
    path: "/api/documents/:id/review/undo",
    action: "document.undo",
    entityType: "document",
    entityId: param("id"),
  },
  {
    method: "PATCH",
    path: "/api/absences/:id/review",
    action: decision("absence"),
    entityType: "absence",
    entityId: param("id"),
    keep: ["status", "notes"],
  },
  // Accounts
  {
    method: "POST",
    path: "/api/coordinator/students",
    action: "account.create",
    entityType: "student",
    entityId: (source) => source.body.student_id,
    keep: ["name", "program", "company", "supervisor_id", "required_hours"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/students/:studentId",
    action: "account.edit",
    entityType: "student",
    entityId: param("studentId"),
    keep: ["name", "program", "company", "supervisor_id", "required_hours"],
  },
  {
    method: "PATCH",
    path: "/api/coordinator/students/:studentId/status",
    action: (source) => (source.body.is_active ? "account.activate" : "account.deactivate"),
    entityType: "student",
    entityId: param("studentId"),
  },
  {
    method: "POST",
    path: "/api/coordinator/students/import",
    action: "account.import",
    entityType: "student",
    entityId: () => null,
    from: (source) => ({ created: source.result.created, failed: source.result.failed }),
  },
  {
    method: "POST",
    path: "/api/coordinator/supervisors",
    action: "account.create",
    entityType: "supervisor",
    entityId: (source) =>
      source.body.supervisor_id ?? nested(source.result.supervisor, "supervisor_id"),
    keep: ["name", "company", "department"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/supervisors/:supervisorId",
    action: "account.edit",
    entityType: "supervisor",
    entityId: param("supervisorId"),
    keep: ["name", "company", "department"],
  },
  {
    method: "PATCH",
    path: "/api/coordinator/supervisors/:supervisorId/status",
    action: (source) => (source.body.is_active ? "account.activate" : "account.deactivate"),
    entityType: "supervisor",
    entityId: param("supervisorId"),
  },
  {
    method: "POST",
    path: "/api/coordinator/:kind/:id/reset-password",
    action: "account.password_reset",
    // "students" / "supervisors" in the address.
    entityType: (source) => String(source.params.kind || "account").replace(/s$/, ""),
    entityId: param("id"),
  },
  {
    method: "POST",
    path: "/api/coordinator/supervisors/:supervisorId/reassign",
    action: "interns.reassign",
    entityType: "supervisor",
    entityId: param("supervisorId"),
    keep: ["to"],
  },
  // Companies
  {
    method: "POST",
    path: "/api/coordinator/company-records",
    action: "company.create",
    entityType: "company",
    entityId: (source) => nested(source.result.company, "id"),
    keep: ["name", "moa_start", "moa_expiry", "slots"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/company-records/:id",
    action: "company.edit",
    entityType: "company",
    entityId: param("id"),
    keep: ["name", "moa_start", "moa_expiry", "slots"],
  },
  {
    method: "PATCH",
    path: "/api/coordinator/company-records/:id/status",
    action: (source) => (source.body.is_active ? "company.activate" : "company.deactivate"),
    entityType: "company",
    entityId: param("id"),
  },
  // Complaints, announcements, requirements, schedules
  {
    method: "PATCH",
    path: "/api/coordinator/complaints/:id/resolve",
    action: "complaint.status",
    entityType: "complaint",
    entityId: param("id"),
    keep: ["status", "resolution_notes"],
  },
  {
    method: "POST",
    path: "/api/coordinator/announcements",
    action: "announcement.send",
    entityType: "announcement",
    entityId: (source) => nested(source.result.announcement, "id") ?? source.result.id,
    keep: ["title", "audience", "company"],
  },
  {
    method: "DELETE",
    path: "/api/coordinator/announcements/:id",
    action: "announcement.withdraw",
    entityType: "announcement",
    entityId: param("id"),
  },
  {
    method: "POST",
    path: "/api/coordinator/requirements",
    action: "requirement.create",
    entityType: "requirement",
    entityId: (source) => nested(source.result.requirement, "id"),
    keep: ["name", "isActive", "is_active"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/requirements/:id",
    action: "requirement.edit",
    entityType: "requirement",
    entityId: param("id"),
    keep: ["name", "isActive", "is_active"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/students/:studentId/schedule",
    action: "schedule.change",
    entityType: "student",
    entityId: param("studentId"),
    from: (source) => ({
      days: Array.isArray(source.body.schedule) ? source.body.schedule.length : undefined,
    }),
  },
];

/** A request value made safe to keep: short text, a number, a flag, or a short list of those. */
function plain(value: unknown): unknown {
  if (typeof value === "string") return value.trim().slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .slice(0, 50)
      .map((item) => (typeof item === "string" ? item.slice(0, 80) : item));
  }
  return undefined;
}

/** The row to write for a request that succeeded, or null when it is not an audited action. */
export function auditEntryFor(
  method: string,
  routePath: string,
  source: Source
): AuditEntry | null {
  const rule = AUDIT_RULES.find(
    (candidate) => candidate.method === method.toUpperCase() && candidate.path === routePath
  );
  if (!rule) return null;

  const action = typeof rule.action === "function" ? rule.action(source) : rule.action;
  if (!action) return null;

  const details: Record<string, unknown> = {};
  for (const key of rule.keep ?? []) {
    const value = plain(source.body[key]);
    if (value !== undefined && value !== "") details[key] = value;
  }
  for (const [key, value] of Object.entries(rule.from?.(source) ?? {})) {
    const kept = plain(value);
    if (kept !== undefined) details[key] = kept;
  }

  const entityId = rule.entityId(source);
  return {
    action,
    entityType: typeof rule.entityType === "function" ? rule.entityType(source) : rule.entityType,
    entityId:
      entityId === undefined || entityId === null || entityId === ""
        ? null
        : String(entityId).slice(0, 80),
    details,
  };
}

type Actor = { role: string; id: string };

/**
 * Watches every request and writes an audit row when an audited route
 * answers with success. Register it before the routes.
 */
export function auditMiddleware(pool: Pool, secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

    // Keep what the route answers with: a created record's id is only there.
    const sendJson = res.json.bind(res);
    res.json = (body?: unknown) => {
      res.locals.auditResult = body;
      return sendJson(body);
    };

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const actor = (req as Request & { auth?: Actor }).auth;
      const routePath = (req.route as { path?: unknown } | undefined)?.path;
      if (!actor || typeof routePath !== "string") return;

      let entry: AuditEntry | null = null;
      try {
        const result = res.locals.auditResult;
        entry = auditEntryFor(req.method, routePath, {
          params: req.params as Record<string, string | undefined>,
          body: req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {},
          result: result && typeof result === "object" ? (result as Record<string, unknown>) : {},
        });
      } catch (error) {
        console.error("AUDIT ENTRY ERROR:", error);
      }
      if (!entry) return;

      const ipHash = createHash("sha256")
        .update(`${secret}|${req.ip || req.socket.remoteAddress || "unknown"}`)
        .digest("hex")
        .slice(0, 32);

      pool
        .query(
          `INSERT INTO audit_log (actor_role, actor_id, action, entity_type, entity_id, details, ip_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            actor.role,
            actor.id,
            entry.action,
            entry.entityType,
            entry.entityId,
            JSON.stringify(entry.details),
            ipHash,
          ]
        )
        .catch((error) => console.error("AUDIT LOG WRITE ERROR:", error));
    });
    next();
  };
}
