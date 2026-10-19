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
| A few READS are logged too: a coordinator opening a student's record, a
| document or an uploaded photo, and a student downloading their own data.
| The row is written after the answer has been sent, so the download never
| waits for it. A page asks for the same record or photo again whenever it
| is reloaded, so a read by the same person of the same thing is written
| once in any ten minutes (`quietMinutes`), not once per request.
|
*/

export type AuditEntry = {
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  /** Set for reads: not written again for the same person and record within this long. */
  quietMinutes?: number;
};

type Source = {
  params: Record<string, string | undefined>;
  body: Record<string, unknown>;
  /** What the route answered with. */
  result: Record<string, unknown>;
  /** What the route chose to say about a request whose answer is a file (res.locals.auditNote). */
  noted?: Record<string, unknown>;
  /** Who is asking: some reads are logged for one kind of account only. */
  actorRole?: string;
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
  /** When set, only these kinds of account are logged. */
  roles?: string[];
  /** For reads: the same person reading the same thing again within this long is not logged twice. */
  quietMinutes?: number;
};

/** How long a repeated read by the same person stays one entry. */
const READ_QUIET_MINUTES = 10;

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

/** A log's times on one line: "08:00, break 12:00 to 13:00, out 17:00, 8 h". */
function timesText(times: unknown): string {
  const at = (key: string) => nested(times, key);
  return [
    `in ${at("time_in") ?? "none"}`,
    at("break_time") ? `break ${at("break_time")} to ${at("break_end_time") ?? "open"}` : "no break",
    `out ${at("time_out") ?? "none"}`,
    at("hours") === null || at("hours") === undefined ? "no hours" : `${at("hours")} h`,
  ].join(", ");
}

export const AUDIT_RULES: Rule[] = [
  // Privacy
  {
    method: "POST",
    path: "/api/students/:studentId/privacy/consent",
    action: "privacy.consent",
    entityType: "student",
    entityId: param("studentId"),
    from: (source) => ({ version: source.result.consent_version }),
  },
  {
    method: "GET",
    path: "/api/students/:studentId/data-export",
    action: "privacy.export",
    entityType: "student",
    entityId: param("studentId"),
    quietMinutes: READ_QUIET_MINUTES,
  },
  // What a coordinator opened. Supervisors and students opening their own are not logged.
  {
    method: "GET",
    path: "/api/coordinator/students/:studentId/overview",
    action: "student.view",
    entityType: "student",
    entityId: param("studentId"),
    roles: ["coordinator"],
    quietMinutes: READ_QUIET_MINUTES,
  },
  {
    method: "GET",
    path: "/api/attachments/:id/file",
    action: "picture.view",
    entityType: "student",
    entityId: (source) => source.noted?.student_id,
    roles: ["coordinator"],
    quietMinutes: READ_QUIET_MINUTES,
    from: (source) => ({ on: source.noted?.owner_type, entry: source.noted?.owner_id, picture: source.params.id }),
  },
  {
    method: "GET",
    path: "/api/documents/:documentId/file",
    action: "document.view",
    entityType: "document",
    entityId: param("documentId"),
    roles: ["coordinator"],
    quietMinutes: READ_QUIET_MINUTES,
    from: (source) => ({
      student_id: source.noted?.student_id,
      name: source.noted?.doc_type,
    }),
  },
  {
    method: "GET",
    path: "/api/uploads/:filename",
    action: "document.view",
    entityType: "upload",
    entityId: param("filename"),
    roles: ["coordinator"],
    quietMinutes: READ_QUIET_MINUTES,
  },
  // Colleges, programs, majors and blocks
  {
    method: "POST",
    path: "/api/coordinator/colleges",
    action: "college.create",
    entityType: "college",
    entityId: (source) => nested(source.result.college, "id"),
    keep: ["name", "short_name"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/colleges/:id",
    action: "college.edit",
    entityType: "college",
    entityId: param("id"),
    keep: ["name", "short_name", "is_active"],
  },
  {
    method: "POST",
    path: "/api/coordinator/programs",
    action: "program.create",
    entityType: "program",
    entityId: (source) => nested(source.result.program, "id"),
    keep: ["name", "short_code", "college_id", "ojt_applies", "formal_name"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/programs/:id",
    action: "program.edit",
    entityType: "program",
    entityId: param("id"),
    keep: ["name", "short_code", "college_id", "ojt_applies", "is_active", "formal_name"],
  },
  {
    method: "POST",
    path: "/api/coordinator/majors",
    action: "major.create",
    entityType: "major",
    entityId: (source) => nested(source.result.major, "id"),
    keep: ["name", "program_id"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/majors/:id",
    action: "major.edit",
    entityType: "major",
    entityId: param("id"),
    keep: ["name", "is_active"],
  },
  {
    method: "POST",
    path: "/api/coordinator/blocks",
    action: "block.create",
    entityType: "block",
    entityId: (source) => nested(source.result.block, "id"),
    keep: ["program_id", "major_id", "year_level", "section", "term_id"],
    from: (source) => ({ block: nested(source.result.block, "name") }),
  },
  {
    method: "PUT",
    path: "/api/coordinator/blocks/:id",
    action: "block.edit",
    entityType: "block",
    entityId: param("id"),
    keep: ["major_id", "year_level", "section", "term_id", "is_active"],
    from: (source) => ({ block: nested(source.result.block, "name") }),
  },
  {
    method: "POST",
    path: "/api/coordinator/blocks/:id/students",
    action: "block.add_students",
    entityType: "block",
    entityId: param("id"),
    from: (source) => ({ students: source.result.count, left_out: source.result.skipped }),
  },
  // Many students' documents taken out at once, with the filters used.
  {
    method: "GET",
    path: "/api/coordinator/documents/zip",
    action: "document.bulk_download",
    entityType: "document",
    entityId: () => null,
    roles: ["coordinator"],
    from: (source) => ({
      filters: source.noted?.filters,
      files: source.noted?.files,
      pictures: source.noted?.pictures,
      missing: source.noted?.missing,
      bytes: source.noted?.bytes,
    }),
  },
  // The log itself: taking a copy of it out is recorded in it.
  {
    method: "GET",
    path: "/api/coordinator/audit/export",
    action: "audit.export",
    entityType: "audit_log",
    entityId: () => null,
    roles: ["coordinator"],
    from: (source) => ({ rows: source.noted?.rows, filters: source.noted?.filters }),
  },
  // Attendance
  {
    method: "PATCH",
    path: "/api/attendance/:id/status",
    action: decision("attendance"),
    entityType: "attendance",
    entityId: param("id"),
    keep: ["status", "reason"],
    from: (source) => ({
      // A day closed as absent for a photo not retaken, verified after all.
      ...(String(source.body.status) === "Verified" && nested(source.result.attendance, "photo_redo_status") === "missed"
        ? { after_missed_photo_redo: true }
        : {}),
      // Iteration 16: which kind of rejection: "attendance" (the whole log) or "time_in" (only the photo).
      ...(String(source.body.status) === "Rejected"
        ? { rejection: nested(source.result.attendance, "rejection_scope") ?? "attendance" }
        : {}),
    }),
  },
  // Iteration 16: messages. Who wrote to whom and about what kind of record,
  // never the subject or the words (those stay in the thread itself).
  {
    method: "POST",
    path: "/api/messages",
    action: "message.send",
    entityType: "message_thread",
    entityId: (source) => source.result.thread_id,
    keep: ["to_role", "to_id", "context_type", "context_id"],
    from: (source) => ({ email: source.result.email_status }),
  },
  {
    method: "POST",
    path: "/api/messages/threads/:id",
    action: "message.reply",
    entityType: "message_thread",
    entityId: param("id"),
    from: (source) => ({ email: source.result.email_status }),
  },
  {
    method: "POST",
    path: "/api/attendance/:id/reject-time-in",
    action: "attendance.reject_time_in",
    entityType: "attendance",
    entityId: param("id"),
    keep: ["reason"],
    from: (source) => ({ window: source.result.closes }),
  },
  {
    method: "POST",
    path: "/api/attendance/:id/reject-time-in/undo",
    action: "attendance.reject_time_in_undo",
    entityType: "attendance",
    entityId: param("id"),
  },
  // Appeals to the coordinator
  {
    method: "POST",
    path: "/api/appeals",
    action: "appeal.file",
    entityType: "attendance",
    entityId: (source) => source.body.attendance_id,
    keep: ["kind"],
    from: (source) => ({ appeal: nested(source.result.appeal, "id") }),
  },
  {
    method: "POST",
    path: "/api/appeals/:id/withdraw",
    action: "appeal.withdraw",
    entityType: "appeal",
    entityId: param("id"),
  },
  {
    method: "PUT",
    path: "/api/coordinator/appeals/:id",
    action: (source) => (source.body.decision === "overturned" ? "appeal.overturn" : "appeal.uphold"),
    entityType: "appeal",
    entityId: param("id"),
    keep: ["note"],
    from: (source) => ({
      kind: nested(source.result.appeal, "kind"),
      attendance: nested(source.result.appeal, "attendance_id"),
    }),
  },
  {
    method: "PATCH",
    path: "/api/attendance/:id/times",
    action: "attendance.correct_times",
    entityType: "attendance",
    entityId: param("id"),
    keep: ["reason"],
    from: (source) => ({
      before: timesText(source.result.before),
      after: timesText(source.result.after),
    }),
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
  // A requirement's due date, reviewer and who it is asked of
  {
    method: "PUT",
    path: "/api/coordinator/requirements/:id/deliverable",
    action: "requirement.deliverable",
    entityType: "requirement",
    entityId: param("id"),
    from: (source) => ({ name: nested(source.result.requirement, "name"), settings: source.result.summary }),
  },
  // The programme's settings: targets, and a schedule for a whole block
  {
    method: "PUT",
    path: "/api/coordinator/kpi-targets",
    action: (source) => (Number(source.result.changed_count) > 0 ? "kpi.targets" : null),
    entityType: "kpi_targets",
    entityId: () => null,
    from: (source) => ({ changed: source.result.changed }),
  },
  {
    method: "PUT",
    path: "/api/coordinator/blocks/:id/schedule",
    action: "schedule.bulk_set",
    entityType: "block",
    entityId: param("id"),
    keep: ["existing"],
    from: (source) => ({
      block: source.result.block,
      schedule: source.result.schedule,
      applied: source.result.applied,
      skipped: source.result.skipped,
      unchanged: source.result.unchanged,
    }),
  },
  // Notes between a supervisor and the coordinators, and a coordinator's reminder
  {
    method: "POST",
    path: "/api/student-notes/:studentId",
    action: "note.create",
    entityType: "student",
    entityId: param("studentId"),
    from: (source) => ({ note_id: nested(source.result.note, "id") }),
  },
  {
    method: "POST",
    path: "/api/coordinator/supervisors/:supervisorId/remind",
    action: "supervisor.remind",
    entityType: "supervisor",
    entityId: param("supervisorId"),
    from: (source) => ({ items: source.result.items, oldest_days: source.result.oldest_days }),
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
  // Giving, changing and cancelling a task. The description and any file are not kept.
  {
    method: "POST",
    path: "/api/tasks",
    action: "task.assign",
    entityType: "task",
    entityId: (source) => nested(source.result.task, "id"),
    keep: ["student_id", "title", "due_date"],
    from: (source) => ({ release_day: nested(source.result.task, "release_day") }),
  },
  {
    method: "PUT",
    path: "/api/tasks/:id",
    action: "task.edit",
    entityType: "task",
    entityId: param("id"),
    keep: ["title", "due_date"],
    from: (source) => ({ student_id: nested(source.result.task, "student_id") }),
  },
  {
    method: "DELETE",
    path: "/api/tasks/:id",
    action: "task.cancel",
    entityType: "task",
    entityId: param("id"),
    from: (source) => ({
      student_id: nested(source.result.task, "student_id"),
      title: nested(source.result.task, "title"),
    }),
  },
  {
    method: "POST",
    path: "/api/tasks/team",
    action: "task.team_assign",
    entityType: "team_task",
    entityId: (source) => source.result.group_task_id,
    keep: ["title", "due_date"],
    from: (source) => ({ team: source.result.team, members: source.result.created }),
  },
  {
    method: "PUT",
    path: "/api/tasks/team/:groupTaskId",
    action: "task.team_edit",
    entityType: "team_task",
    entityId: param("groupTaskId"),
    keep: ["title", "due_date"],
    from: (source) => ({ members: source.result.updated, left_as_is: source.result.skipped }),
  },
  {
    method: "DELETE",
    path: "/api/tasks/team/:groupTaskId",
    action: "task.team_cancel",
    entityType: "team_task",
    entityId: param("groupTaskId"),
    from: (source) => ({
      title: source.result.title,
      members: source.result.cancelled,
      kept: source.result.skipped,
    }),
  },
  // Evaluations a supervisor or coordinator writes about a student. The
  // comments are not kept. A student's own feedback is not an audited action.
  {
    method: "POST",
    path: "/api/evaluations",
    action: "evaluation.create",
    entityType: "student",
    entityId: (source) => source.body.student_id,
    keep: ["category", "rating"],
    roles: ["supervisor", "coordinator"],
  },
  {
    method: "PUT",
    path: "/api/evaluations/:id",
    action: "evaluation.edit",
    entityType: "student",
    entityId: (source) => nested(source.result.evaluation, "student_id"),
    from: (source) => ({
      category: nested(source.result.evaluation, "category"),
      rating: nested(source.result.evaluation, "rating"),
    }),
  },
  {
    method: "DELETE",
    path: "/api/evaluations/:id",
    action: "evaluation.remove",
    entityType: "student",
    entityId: (source) => nested(source.result.evaluation, "student_id"),
    from: (source) => ({
      category: nested(source.result.evaluation, "category"),
      rating: nested(source.result.evaluation, "rating"),
    }),
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
    // Checking a file creates nothing, so it is not an action to record.
    action: (source) => (source.body.dry_run === true ? null : "account.import"),
    entityType: "student",
    entityId: () => null,
    from: (source) => ({ created: source.result.created, failed: source.result.failed }),
  },
  {
    method: "POST",
    path: "/api/coordinator/supervisors/import",
    action: (source) => (source.body.dry_run === true ? null : "account.import"),
    entityType: "supervisor",
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
    // Someone else's contact details (migration 060): which fields, never their values.
    method: "PUT",
    path: "/api/coordinator/people/:role/:id/details",
    action: "account.details_edit",
    entityType: (source) => String(source.params.role || "account"),
    entityId: param("id"),
    from: (source) => ({ changed: Array.isArray(source.result.changed) ? source.result.changed.join(", ") : undefined }),
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
  // Site visits
  {
    method: "POST",
    path: "/api/coordinator/site-visits",
    action: "site_visit.log",
    entityType: "company",
    entityId: (source) => source.body.company_id,
    keep: ["visit_date"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/site-visits/:id",
    action: "site_visit.edit",
    entityType: "company",
    entityId: (source) => source.body.company_id,
    keep: ["visit_date"],
  },
  {
    method: "DELETE",
    path: "/api/coordinator/site-visits/:id",
    action: "site_visit.remove",
    entityType: "company",
    entityId: (source) => nested(source.result.visit, "company_id"),
    from: (source) => ({ visit_date: nested(source.result.visit, "visit_date") }),
  },
  // Coordinator accounts
  {
    method: "POST",
    path: "/api/coordinator/coordinators",
    action: "account.create",
    entityType: "coordinator",
    entityId: (source) => source.body.coordinator_id,
    keep: ["name", "department"],
  },
  {
    method: "PATCH",
    path: "/api/coordinator/coordinators/:id/status",
    action: (source) => (source.body.is_active ? "account.activate" : "account.deactivate"),
    entityType: "coordinator",
    entityId: param("id"),
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
    keep: ["name", "moa_start", "moa_expiry", "slots", "industry", "website"],
  },
  {
    method: "PATCH",
    path: "/api/coordinator/company-records/:id/status",
    action: (source) => (source.body.is_active ? "company.activate" : "company.deactivate"),
    entityType: "company",
    entityId: param("id"),
  },
  // Terms
  {
    method: "POST",
    path: "/api/coordinator/terms",
    action: "term.create",
    entityType: "term",
    entityId: (source) => nested(source.result.term, "id"),
    keep: ["name", "start_date", "end_date"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/terms/:id",
    action: "term.edit",
    entityType: "term",
    entityId: param("id"),
    keep: ["name", "start_date", "end_date"],
  },
  {
    method: "POST",
    path: "/api/coordinator/terms/:id/students",
    action: "term.add_students",
    entityType: "term",
    entityId: param("id"),
    from: (source) => ({ students: source.result.count }),
  },
  {
    method: "POST",
    path: "/api/coordinator/terms/:id/close",
    action: "term.close",
    entityType: "term",
    entityId: param("id"),
    from: (source) => ({ deactivated: source.result.deactivated }),
  },
  {
    method: "POST",
    path: "/api/coordinator/terms/:id/reopen",
    action: "term.reopen",
    entityType: "term",
    entityId: param("id"),
    from: (source) => ({ reactivated: source.result.reactivated }),
  },
  // Final evaluation
  {
    method: "PUT",
    path: "/api/coordinator/evaluation-form",
    action: "evaluation_form.save",
    entityType: "evaluation_form",
    entityId: (source) => nested(source.result.form, "id"),
    keep: ["name", "scale_max"],
    from: (source) => ({
      criteria: Array.isArray(source.body.criteria) ? source.body.criteria.length : undefined,
    }),
  },
  {
    method: "PUT",
    path: "/api/final-evaluations/:studentId",
    action: "final_evaluation.submit",
    entityType: "student",
    entityId: param("studentId"),
    from: (source) => ({ average: nested(source.result.evaluation, "average") }),
  },
  // Time record certification
  {
    method: "POST",
    path: "/api/dtr-certifications",
    action: "dtr.certify",
    entityType: "student",
    entityId: (source) => source.body.student_id,
    keep: ["month"],
    from: (source) => ({ verified_hours: nested(source.result.certification, "verified_hours") }),
  },
  {
    method: "DELETE",
    path: "/api/dtr-certifications/:id",
    action: "dtr.withdraw",
    entityType: "student",
    entityId: (source) => nested(source.result.certification, "student_id"),
    from: (source) => ({ month: nested(source.result.certification, "month") }),
  },
  // Weekly journals
  {
    method: "PATCH",
    path: "/api/journals/:id/review",
    action: (source) =>
      source.body.status === "Reviewed"
        ? "journal.review"
        : source.body.status === "Returned"
          ? "journal.return"
          : source.body.status === "Submitted"
            ? "journal.undo"
            : null,
    entityType: "journal",
    entityId: param("id"),
    keep: ["notes"],
  },
  // The institution's lines on the Time Record (Iteration 18)
  {
    method: "PUT",
    path: "/api/coordinator/institution",
    action: "institution.edit",
    entityType: "institution",
    entityId: () => "1",
    keep: ["republic_line", "university_name", "campus_name", "locality_line"],
  },
  // Holidays
  {
    method: "POST",
    path: "/api/coordinator/holidays",
    action: "holiday.create",
    entityType: "holiday",
    entityId: (source) => nested(source.result.holiday, "id"),
    keep: ["date", "name"],
  },
  {
    method: "PUT",
    path: "/api/coordinator/holidays/:id",
    action: "holiday.edit",
    entityType: "holiday",
    entityId: param("id"),
    keep: ["date", "name"],
  },
  {
    method: "DELETE",
    path: "/api/coordinator/holidays/:id",
    action: "holiday.remove",
    entityType: "holiday",
    entityId: param("id"),
    from: (source) => ({
      date: nested(source.result.holiday, "date"),
      name: nested(source.result.holiday, "name"),
    }),
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
  // Iteration 15: a coordinator saying a backup was restored and checked.
  {
    method: "POST",
    path: "/api/coordinator/backups/restore-drill",
    action: "backup.restore_drill",
    entityType: "backup",
    entityId: (source) => nested(source.result, "drill") && nested(nested(source.result, "drill"), "id"),
    roles: ["coordinator"],
    keep: ["detail"],
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
  if (rule.roles && !rule.roles.includes(source.actorRole ?? "")) return null;

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
    ...(rule.quietMinutes ? { quietMinutes: rule.quietMinutes } : {}),
  };
}

/** True when some rule logs a read of this route. Most GETs have none, and are left alone. */
const READ_PATHS = new Set(AUDIT_RULES.filter((rule) => rule.method === "GET").map((rule) => rule.path));

type Actor = { role: string; id: string };

/**
 * Watches every request and writes an audit row when an audited route
 * answers with success. Register it before the routes.
 */
export function auditMiddleware(pool: Pool, secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "HEAD" || req.method === "OPTIONS") return next();
    const reading = req.method === "GET";

    if (!reading) {
      // Keep what the route answers with: a created record's id is only there.
      const sendJson = res.json.bind(res);
      res.json = (body?: unknown) => {
        res.locals.auditResult = body;
        return sendJson(body);
      };
    }

    // After the answer has gone out: logging never holds up a request or a download.
    res.on("finish", () => {
      // 304: the browser already had the file and showed it again.
      const succeeded =
        (res.statusCode >= 200 && res.statusCode < 300) || (reading && res.statusCode === 304);
      if (!succeeded) return;
      const actor = (req as Request & { auth?: Actor }).auth;
      const routePath = (req.route as { path?: unknown } | undefined)?.path;
      if (!actor || typeof routePath !== "string") return;
      if (reading && !READ_PATHS.has(routePath)) return;

      let entry: AuditEntry | null = null;
      try {
        const result = res.locals.auditResult;
        entry = auditEntryFor(req.method, routePath, {
          params: req.params as Record<string, string | undefined>,
          body: req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {},
          result: result && typeof result === "object" ? (result as Record<string, unknown>) : {},
          noted:
            res.locals.auditNote && typeof res.locals.auditNote === "object"
              ? (res.locals.auditNote as Record<string, unknown>)
              : {},
          actorRole: actor.role,
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
           SELECT $1, $2, $3, $4, $5, $6, $7
           WHERE $8::int IS NULL OR NOT EXISTS (
             SELECT 1 FROM audit_log recent
             WHERE recent.actor_role = $1 AND recent.actor_id = $2 AND recent.action = $3
               AND recent.entity_type IS NOT DISTINCT FROM $4
               AND recent.entity_id IS NOT DISTINCT FROM $5
               AND recent.created_at > NOW() - make_interval(mins => $8::int)
           )`,
          [
            actor.role,
            actor.id,
            entry.action,
            entry.entityType,
            entry.entityId,
            JSON.stringify(entry.details),
            ipHash,
            entry.quietMinutes ?? null,
          ]
        )
        .catch((error) => console.error("AUDIT LOG WRITE ERROR:", error));
    });
    next();
  };
}
