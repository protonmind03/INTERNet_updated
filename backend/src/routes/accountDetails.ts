import type express from "express";
import type { Pool } from "pg";
import { CONCERN_OLD_AFTER_DAYS } from "../services/kpiDefinitions";

/*
|--------------------------------------------------------------------------
| ACCOUNT DETAILS, AND THE COORDINATOR'S COMPANY AND SUPERVISOR PAGES
|--------------------------------------------------------------------------
|
| Roadmap 5.3 (migration 060): the details each role needs to reach and
| identify people. Everyone edits their own through /api/me/profile; the
| coordinator edits anyone's through /api/coordinator/people/:role/:id/
| details, which is audited with the names of the fields changed (never
| their values: a personal mobile does not belong in the audit log).
|
| A personal mobile is shown to others only when its owner says so
| (show_mobile). Office hours, position and work contact are not private.
|
| Also here, for the coordinator's Companies hub (5.2) and Resolution
| Center (5.4): a company's page, a supervisor's view page, and the count
| on the Resolution Center's icon.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
};

export const CONTACT_METHODS = ["email", "mobile", "message", "office"] as const;
const PHONE = /^[0-9+() .-]{7,20}$/;

type Field = {
  /** The column it is kept in. */
  column: string;
  check: (value: unknown) => { value: unknown } | { problem: string };
};

const text = (label: string, max: number) => (value: unknown) => {
  if (value === null || value === undefined) return { value: null };
  if (typeof value !== "string") return { problem: `${label} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { problem: `${label} is at most ${max} characters.` };
  return { value: trimmed || null };
};
const phone = (label: string) => (value: unknown) => {
  const read = text(label, 20)(value);
  if ("problem" in read || read.value === null) return read;
  return PHONE.test(String(read.value))
    ? read
    : { problem: `Write ${label.toLowerCase()} with 7 to 20 digits. Spaces, +, - and brackets are fine.` };
};
const flag = (value: unknown) =>
  typeof value === "boolean" ? { value } : { problem: "Say yes or no to showing the mobile number." };
const method = (value: unknown) =>
  value === null || value === "" || value === undefined
    ? { value: null }
    : CONTACT_METHODS.includes(value as (typeof CONTACT_METHODS)[number])
      ? { value }
      : { problem: "Choose email, mobile, a message in INTERNet, or the office." };
const collegeId = (value: unknown) =>
  value === null || value === "" || value === undefined
    ? { value: null }
    : Number.isInteger(Number(value)) && Number(value) > 0
      ? { value: Number(value) }
      : { problem: "Choose a college from the list." };

/** The details each role keeps, by the name the app uses for them. */
export const FIELDS: Record<Role, Record<string, Field>> = {
  student: {
    preferred_contact: { column: "preferred_contact", check: method },
  },
  supervisor: {
    mobile_number: { column: "mobile_number", check: phone("The mobile number") },
    show_mobile: { column: "show_mobile", check: flag },
    position: { column: "job_title", check: text("The job title", 120) },
    department: { column: "department", check: text("The department", 150) },
    work_phone: { column: "work_phone", check: phone("The work phone") },
    office_hours: { column: "contact_hours", check: text("The hours you can be reached", 120) },
    preferred_contact: { column: "preferred_contact", check: method },
  },
  coordinator: {
    mobile_number: { column: "mobile_number", check: phone("The mobile number") },
    show_mobile: { column: "show_mobile", check: flag },
    position: { column: "position", check: text("The position", 120) },
    department: { column: "department", check: text("The office or department", 150) },
    office_hours: { column: "office_hours", check: text("The office hours", 120) },
    preferred_contact: { column: "preferred_contact", check: method },
    employee_number: { column: "employee_number", check: text("The employee number", 40) },
    college_id: { column: "college_id", check: collegeId },
    office_location: { column: "office_location", check: text("The office location", 150) },
  },
};

const TABLE: Record<Role, { table: string; id: string }> = {
  student: { table: "students", id: "student_id" },
  supervisor: { table: "supervisors", id: "supervisor_id" },
  coordinator: { table: "coordinators", id: "coordinator_id" },
};

const isRole = (value: unknown): value is Role => value === "student" || value === "supervisor" || value === "coordinator";

/** Reads the details sent for a role: only its own fields, each checked. */
export function readDetails(
  role: Role,
  body: unknown
): { changes: Record<string, unknown> } | { problem: string } {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    const field = FIELDS[role][key];
    if (!field) return { problem: `"${key}" is not one of the details kept for this account.` };
    const read = field.check(input[key]);
    if ("problem" in read) return read;
    changes[key] = read.value;
  }
  if (Object.keys(changes).length === 0) return { problem: "Nothing to save." };
  return { changes };
}

export function registerAccountDetailRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator } = deps;

  async function details(role: Role, id: string): Promise<Record<string, unknown> | null> {
    const { table, id: idColumn } = TABLE[role];
    const columns = Object.entries(FIELDS[role]).map(([key, field]) => `${field.column} AS ${key}`);
    const result = await pool.query(
      `SELECT ${idColumn} AS id, name, email, ${columns.join(", ")} FROM ${table} WHERE ${idColumn} = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async function save(role: Role, id: string, changes: Record<string, unknown>): Promise<string[]> {
    if (changes.college_id) {
      const college = await pool.query(`SELECT 1 FROM colleges WHERE id = $1`, [changes.college_id]);
      if (college.rows.length === 0) throw Object.assign(new Error("college"), { status: 400, reply: "Choose a college from the list." });
    }
    const before = await details(role, id);
    if (!before) throw Object.assign(new Error("missing"), { status: 404, reply: "That account was not found." });
    const { table, id: idColumn } = TABLE[role];
    const keys = Object.keys(changes);
    const sets = keys.map((key, index) => `${FIELDS[role][key].column} = $${index + 2}`);
    await pool.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $1`, [id, ...keys.map((key) => changes[key])]);
    // Only what really changed is named in the audit log.
    return keys.filter((key) => String(before[key] ?? "") !== String(changes[key] ?? ""));
  }

  const colleges = async () =>
    (await pool.query(`SELECT id, name FROM colleges WHERE is_active = TRUE ORDER BY name`)).rows;

  const fail = (res: express.Response, error: unknown, label: string) => {
    const known = error as { status?: number; reply?: string };
    if (known.status && known.reply) return res.status(known.status).json({ message: known.reply });
    console.error(`${label}:`, error);
    return res.status(500).json({ message: "The details could not be saved." });
  };

  /** One's own details. */
  app.get("/api/me/profile", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const found = await details(auth.role, auth.id);
      if (!found) return res.status(404).json({ message: "Your account was not found." });
      return res.json({
        role: auth.role,
        details: found,
        contact_methods: CONTACT_METHODS,
        ...(auth.role === "coordinator" ? { colleges: await colleges() } : {}),
      });
    } catch (error) {
      console.error("READ MY DETAILS ERROR:", error);
      return res.status(500).json({ message: "Failed to load your details." });
    }
  });

  app.put("/api/me/profile", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const read = readDetails(auth.role, req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      await save(auth.role, auth.id, read.changes);
      return res.json({ message: "Your details are saved.", details: await details(auth.role, auth.id) });
    } catch (error) {
      return fail(res, error, "SAVE MY DETAILS ERROR");
    }
  });

  /** Someone else's details, for the coordinator. Changes are audited by field name. */
  app.get("/api/coordinator/people/:role/:id/details", requireCoordinator, async (req, res) => {
    try {
      if (!isRole(req.params.role)) return res.status(404).json({ message: "That account was not found." });
      const found = await details(req.params.role, String(req.params.id));
      if (!found) return res.status(404).json({ message: "That account was not found." });
      return res.json({
        role: req.params.role,
        details: found,
        contact_methods: CONTACT_METHODS,
        ...(req.params.role === "coordinator" ? { colleges: await colleges() } : {}),
      });
    } catch (error) {
      console.error("READ DETAILS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the details." });
    }
  });

  app.put("/api/coordinator/people/:role/:id/details", requireCoordinator, async (req, res) => {
    try {
      if (!isRole(req.params.role)) return res.status(404).json({ message: "That account was not found." });
      const role = req.params.role;
      const read = readDetails(role, req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const changed = await save(role, String(req.params.id), read.changes);
      return res.json({
        message: "Details saved.",
        details: await details(role, String(req.params.id)),
        // For the audit log: which fields, not what they now say.
        changed,
      });
    } catch (error) {
      return fail(res, error, "SAVE DETAILS ERROR");
    }
  });

  /** A company's page: its details, its supervisors with their interns, and its visits. */
  app.get("/api/coordinator/company-records/:id/page", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ message: "Company not found." });
      const id = Number(req.params.id);
      const company = await pool.query(
        `SELECT c.id, c.name, c.address, c.contact_person, c.contact_email, c.contact_phone,
                TO_CHAR(c.moa_start, 'YYYY-MM-DD') AS moa_start, TO_CHAR(c.moa_expiry, 'YYYY-MM-DD') AS moa_expiry,
                c.slots, c.industry, c.website, c.hr_contact, c.is_active,
                (SELECT COUNT(*)::int FROM students s WHERE s.company_id = c.id AND s.is_active = TRUE) AS students
         FROM companies c WHERE c.id = $1`,
        [id]
      );
      if (company.rows.length === 0) return res.status(404).json({ message: "Company not found." });
      const [supervisors, visits] = await Promise.all([
        pool.query(
          `SELECT p.supervisor_id, p.name, p.email, p.department, p.job_title AS position, p.is_active,
                  (SELECT COUNT(*)::int FROM students s WHERE s.supervisor_id = p.supervisor_id AND s.is_active = TRUE) AS interns
           FROM supervisors p WHERE p.company_id = $1
           ORDER BY p.is_active DESC, p.name`,
          [id]
        ),
        pool.query(
          `SELECT id, TO_CHAR(visit_date, 'YYYY-MM-DD') AS visit_date, visited_by_name, findings, follow_up
           FROM site_visits WHERE company_id = $1 ORDER BY visit_date DESC, id DESC`,
          [id]
        ),
      ]);
      return res.json({ company: company.rows[0], supervisors: supervisors.rows, visits: visits.rows });
    } catch (error) {
      console.error("COMPANY PAGE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the company." });
    }
  });

  /** A supervisor's view page: who they are, how to reach them, and their interns. */
  app.get("/api/coordinator/supervisors/:supervisorId/page", requireCoordinator, async (req, res) => {
    try {
      const id = String(req.params.supervisorId);
      const supervisor = await pool.query(
        `SELECT p.supervisor_id, p.name, p.email, p.company, p.company_id, p.department, p.is_active,
                p.job_title AS position, p.work_phone, p.contact_hours AS office_hours, p.preferred_contact,
                p.mobile_number, p.show_mobile
         FROM supervisors p WHERE p.supervisor_id = $1`,
        [id]
      );
      if (supervisor.rows.length === 0) return res.status(404).json({ message: "Supervisor not found." });
      const interns = await pool.query(
        `SELECT s.student_id, s.name, s.email, s.program, s.is_active
         FROM students s WHERE s.supervisor_id = $1
         ORDER BY s.is_active DESC, s.name`,
        [id]
      );
      return res.json({ supervisor: supervisor.rows[0], interns: interns.rows });
    } catch (error) {
      console.error("SUPERVISOR PAGE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the supervisor." });
    }
  });

  /**
   * The number on the Resolution Center's icon: open concerns and open
   * appeals older than the dashboard's rule for concerns (7 days).
   */
  app.get("/api/coordinator/resolution/count", requireCoordinator, async (_req, res) => {
    try {
      const result = await pool.query<{ concerns: number; appeals: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM complaints
            WHERE status NOT IN ('Resolved', 'Dismissed') AND created_at < NOW() - make_interval(days => $1)) AS concerns,
           (SELECT COUNT(*)::int FROM attendance_appeals
            WHERE status = 'open' AND created_at < NOW() - make_interval(days => $1)) AS appeals`,
        [CONCERN_OLD_AFTER_DAYS]
      );
      const { concerns, appeals } = result.rows[0];
      return res.json({ count: concerns + appeals, concerns, appeals, older_than_days: CONCERN_OLD_AFTER_DAYS });
    } catch (error) {
      console.error("RESOLUTION COUNT ERROR:", error);
      return res.status(500).json({ message: "Failed to count what is waiting." });
    }
  });
}
