import path from "node:path";
import type express from "express";
import type { Pool } from "pg";
import { sameId } from "../services/ids";

/*
|--------------------------------------------------------------------------
| HOST TRAINING ESTABLISHMENTS (Phase 1.3, migration 083)
|--------------------------------------------------------------------------
|
|   status       applied, screening, approved or suspended, changed by the
|                office (requireOffice) with the version it was read at. A
|                private company is approved only when its latest screening
|                passed, or passed with conditions.
|   screenings   a visit's four ratings (1 to 5, a note each) and the
|                decision; written by coordinators, read by the office.
|   the MOA      the signed agreement in the private file store, and
|                whether and when it was notarized; coordinators only.
|   requests     an agency a student or coordinator suggests; approving one
|                makes the company, in screening.
|
| Placements (the slots, and approved companies only) are checked where a
| student's company is written: services/placement.ts.
|
*/

type Role = "student" | "supervisor" | "coordinator" | "director";
type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  requireStaff: express.RequestHandler;
  requireOffice: express.RequestHandler;
  upload: { single: (field: string) => express.RequestHandler };
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
  readPrivateFile: (fileName: string) => Promise<{ buffer: Buffer; contentType?: string }>;
  createNotification: (options: { studentId?: string | null; title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
  notifyCoordinators: (options: { title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
};

export const HTE_TYPES = ["government", "private", "university"] as const;
export const HTE_STATUSES = ["applied", "screening", "approved", "suspended"] as const;
const CRITERIA = ["standing", "work_environment", "space_capacity", "safety"] as const;
const DECISIONS = ["pass", "conditional", "fail"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOA_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
/** A student may have this many suggestions waiting at once. */
const OPEN_REQUESTS_PER_STUDENT = 3;

/**
 * SQL: true when the company's latest screening (by date, then the last
 * recorded) passed or passed with conditions. A pass followed by a failed
 * re-screening is not enough. `companyId` is a column or a $ parameter.
 */
export const latestScreeningPassed = (companyId: string) =>
  `COALESCE((SELECT ls.decision IN ('pass', 'conditional') FROM company_screenings ls
     WHERE ls.company_id = ${companyId} ORDER BY ls.screened_on DESC, ls.id DESC LIMIT 1), FALSE)`;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const realDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const idOf = (value: unknown) => (/^\d+$/.test(String(value)) ? Number(value) : null);

const SCREENING_COLUMNS = `id, company_id, screened_by, TO_CHAR(screened_on, 'YYYY-MM-DD') AS screened_on,
  standing, standing_note, work_environment, work_environment_note, space_capacity, space_capacity_note,
  safety, safety_note, decision, notes, version, created_at, updated_at`;

/** A screening as sent, or the problem with it. */
function readScreening(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const screenedOn = text(body.screened_on, 10);
  if (!realDate(screenedOn)) return { problem: "Give the screening date as YYYY-MM-DD." };
  out.screened_on = screenedOn;
  for (const key of CRITERIA) {
    const rating = body[key];
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { problem: `Rate ${key.replace("_", " ")} from 1 to 5.` };
    }
    out[key] = rating;
    out[`${key}_note`] = text(body[`${key}_note`], 500) || null;
  }
  if (!(DECISIONS as readonly unknown[]).includes(body.decision)) return { problem: "The decision is pass, pass with conditions, or fail." };
  out.decision = body.decision;
  out.notes = text(body.notes, 2000) || null;
  if (out.decision === "conditional" && !out.notes) return { problem: "Say what the conditions are." };
  return { screening: out };
}

export function registerHteRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator, requireStaff, requireOffice } = deps;

  /*
  | Status: the office decides, from the version it read.
  */
  app.put("/api/coordinator/company-records/:id/hte-status", requireOffice, async (req, res) => {
    const id = idOf(req.params.id);
    if (id === null) return res.status(404).json({ message: "Company not found." });
    const status = req.body?.status;
    if (!(HTE_STATUSES as readonly unknown[]).includes(status)) {
      return res.status(400).json({ message: "The status is applied, screening, approved or suspended." });
    }
    const expected = Number(req.body?.expected_version);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ name: string; status: string; hte_type: string; version: number }>(
        `SELECT name, status, hte_type, version FROM companies WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const company = found.rows[0];
      if (!company) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Company not found." });
      }
      if (company.version !== expected) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "STALE", message: `Someone changed ${company.name} after you opened it. It is reloaded; check it again.`, status: company.status, version: company.version });
      }
      if (status === "approved" && company.hte_type === "private") {
        const passed = await client.query<{ passed: boolean }>(`SELECT ${latestScreeningPassed("$1")} AS passed`, [id]);
        if (!passed.rows[0].passed) {
          await client.query("ROLLBACK");
          return res.status(409).json({ code: "SCREENING_REQUIRED", message: `${company.name} is a private company: its latest screening must have passed before it is approved.` });
        }
      }
      const saved = await client.query<{ version: number }>(
        `UPDATE companies SET status = $2, version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING version`,
        [id, status]
      );
      await client.query("COMMIT");
      const words: Record<string, string> = {
        approved: `${company.name} is approved. Students can be placed there.`,
        suspended: `${company.name} is suspended. No new student can be placed there; students already there stay.`,
        screening: `${company.name} is being screened.`,
        applied: `${company.name} is back to applied.`,
      };
      return res.json({ message: words[status], old: company.status, status, version: saved.rows[0].version });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("HTE STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to change the company's status." });
    } finally {
      client.release();
    }
  });

  /*
  | Screenings.
  */
  app.get("/api/coordinator/company-records/:id/screenings", requireStaff, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      if (id === null) return res.status(404).json({ message: "Company not found." });
      const rows = await pool.query(`SELECT ${SCREENING_COLUMNS} FROM company_screenings WHERE company_id = $1 ORDER BY screened_on DESC, id DESC`, [id]);
      return res.json({ screenings: rows.rows });
    } catch (error) {
      console.error("LIST SCREENINGS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the screenings." });
    }
  });

  app.post("/api/coordinator/company-records/:id/screenings", requireCoordinator, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      if (id === null) return res.status(404).json({ message: "Company not found." });
      const read = readScreening(req.body ?? {});
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const company = await pool.query(`SELECT 1 FROM companies WHERE id = $1`, [id]);
      if (company.rows.length === 0) return res.status(404).json({ message: "Company not found." });
      const s = read.screening;
      const saved = await pool.query(
        `INSERT INTO company_screenings (company_id, screened_by, screened_on, standing, standing_note, work_environment, work_environment_note,
           space_capacity, space_capacity_note, safety, safety_note, decision, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${SCREENING_COLUMNS}`,
        [id, (req as Authed).auth!.id, s.screened_on, s.standing, s.standing_note, s.work_environment, s.work_environment_note,
          s.space_capacity, s.space_capacity_note, s.safety, s.safety_note, s.decision, s.notes]
      );
      return res.status(201).json({ message: "Screening recorded.", screening: saved.rows[0] });
    } catch (error) {
      console.error("ADD SCREENING ERROR:", error);
      return res.status(500).json({ message: "Failed to record the screening." });
    }
  });

  app.put("/api/coordinator/company-screenings/:screeningId", requireCoordinator, async (req, res) => {
    try {
      const id = idOf(req.params.screeningId);
      if (id === null) return res.status(404).json({ message: "Screening not found." });
      const read = readScreening(req.body ?? {});
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const s = read.screening;
      const saved = await pool.query(
        `UPDATE company_screenings SET screened_on = $3, standing = $4, standing_note = $5, work_environment = $6, work_environment_note = $7,
           space_capacity = $8, space_capacity_note = $9, safety = $10, safety_note = $11, decision = $12, notes = $13,
           version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2 RETURNING ${SCREENING_COLUMNS}`,
        [id, Number(req.body?.expected_version), s.screened_on, s.standing, s.standing_note, s.work_environment, s.work_environment_note,
          s.space_capacity, s.space_capacity_note, s.safety, s.safety_note, s.decision, s.notes]
      );
      if (saved.rows.length === 0) {
        const exists = await pool.query(`SELECT 1 FROM company_screenings WHERE id = $1`, [id]);
        return exists.rows.length === 0
          ? res.status(404).json({ message: "Screening not found." })
          : res.status(409).json({ code: "STALE", message: "Someone changed this screening after you opened it. It is reloaded; check it again." });
      }
      return res.json({ message: "Screening updated.", screening: saved.rows[0] });
    } catch (error) {
      console.error("UPDATE SCREENING ERROR:", error);
      return res.status(500).json({ message: "Failed to update the screening." });
    }
  });

  app.delete("/api/coordinator/company-screenings/:screeningId", requireCoordinator, async (req, res) => {
    try {
      const id = idOf(req.params.screeningId);
      if (id === null) return res.status(404).json({ message: "Screening not found." });
      const removed = await pool.query<{ company_id: number }>(`DELETE FROM company_screenings WHERE id = $1 RETURNING company_id`, [id]);
      if (removed.rows.length === 0) return res.status(404).json({ message: "Screening not found." });
      // A private company approved on it, with no other screening that passed, goes back to screening.
      const reopened = await pool.query(
        `UPDATE companies SET status = 'screening', version = version + 1
         WHERE id = $1 AND hte_type = 'private' AND status = 'approved'
           AND NOT EXISTS (SELECT 1 FROM company_screenings WHERE company_id = $1 AND decision IN ('pass', 'conditional'))
         RETURNING name`,
        [removed.rows[0].company_id]
      );
      return res.json({
        message: reopened.rows.length > 0 ? `Screening removed. ${reopened.rows[0].name} has no screening that passed now, so it is back to screening.` : "Screening removed.",
      });
    } catch (error) {
      console.error("REMOVE SCREENING ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the screening." });
    }
  });

  /*
  | The MOA: the signed copy (PDF, JPG or PNG, checked as every upload is)
  | and whether it is notarized.
  */
  app.post("/api/coordinator/company-records/:id/moa", requireCoordinator, deps.upload.single("file"), async (req, res) => {
    const id = idOf(req.params.id);
    if (id === null) return res.status(404).json({ message: "Company not found." });
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Choose the signed agreement to upload." });
    const extension = path.extname(file.originalname).toLowerCase();
    if (MOA_TYPES[extension] !== file.mimetype) return res.status(400).json({ message: "The agreement is a PDF, JPG or PNG." });
    let stored: string | null = null;
    try {
      stored = await deps.savePrivateFile(file);
      const previous = await pool.query<{ moa_document_path: string | null }>(`SELECT moa_document_path FROM companies WHERE id = $1`, [id]);
      if (previous.rows.length === 0) {
        await deps.deletePrivateFile(stored).catch(() => undefined);
        return res.status(404).json({ message: "Company not found." });
      }
      await pool.query(
        `UPDATE companies SET moa_document_path = $2, moa_document_name = $3, moa_document_type = $4, updated_at = NOW() WHERE id = $1`,
        [id, stored, file.originalname.replace(/[\r\n"]/g, "_").slice(0, 200), file.mimetype]
      );
      const old = previous.rows[0].moa_document_path;
      if (old) await deps.deletePrivateFile(old).catch((error) => console.error("REMOVE OLD MOA ERROR:", error));
      return res.status(201).json({ message: "Agreement uploaded.", moa_file: file.originalname });
    } catch (error) {
      if (stored) await deps.deletePrivateFile(stored).catch(() => undefined);
      console.error("UPLOAD MOA ERROR:", error);
      return res.status(500).json({ message: "Failed to upload the agreement." });
    }
  });

  app.get("/api/coordinator/company-records/:id/moa", requireCoordinator, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      if (id === null) return res.status(404).json({ message: "Company not found." });
      const found = await pool.query<{ moa_document_path: string | null; moa_document_name: string | null; moa_document_type: string | null }>(
        `SELECT moa_document_path, moa_document_name, moa_document_type FROM companies WHERE id = $1`,
        [id]
      );
      const row = found.rows[0];
      if (!row?.moa_document_path) return res.status(404).json({ message: "No agreement has been uploaded for this company." });
      const file = await deps.readPrivateFile(path.basename(row.moa_document_path));
      return res
        .type(row.moa_document_type || file.contentType || "application/octet-stream")
        .attachment(row.moa_document_name || "agreement")
        .send(file.buffer);
    } catch (error) {
      console.error("GET MOA ERROR:", error);
      return res.status(500).json({ message: "Failed to open the agreement." });
    }
  });

  app.put("/api/coordinator/company-records/:id/moa-notarized", requireCoordinator, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      if (id === null) return res.status(404).json({ message: "Company not found." });
      const notarized = req.body?.notarized;
      if (typeof notarized !== "boolean") return res.status(400).json({ message: "Say whether the agreement is notarized." });
      const on = text(req.body?.notarized_on, 10);
      if (notarized && !realDate(on)) return res.status(400).json({ message: "Give the date it was notarized, as YYYY-MM-DD." });
      const saved = await pool.query(
        `UPDATE companies SET moa_notarized = $2, moa_notarized_on = $3, updated_at = NOW() WHERE id = $1 RETURNING name`,
        [id, notarized, notarized ? on : null]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Company not found." });
      return res.json({ message: notarized ? "Agreement marked notarized." : "Agreement marked not notarized." });
    } catch (error) {
      console.error("MOA NOTARIZED ERROR:", error);
      return res.status(500).json({ message: "Failed to save the agreement." });
    }
  });

  /*
  | Requests: a student suggests an agency from their Company page, or a
  | coordinator records one (for an agency, or the university itself).
  */
  const REQUEST_COLUMNS = `r.id, r.requested_by_role, r.requested_by_id, r.company_name, r.hte_type, r.address, r.contact, r.reason,
    r.status, r.decided_by, r.decided_at, r.decision_note, r.company_id, r.version, r.created_at`;

  app.post("/api/company-requests", requireRole(["student", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const name = text(req.body?.company_name, 150);
      const reason = text(req.body?.reason, 1000);
      const hteType = req.body?.hte_type ?? "private";
      if (name.length < 2) return res.status(400).json({ message: "Give the agency's name." });
      if (reason.length < 10) return res.status(400).json({ message: "Say in a sentence why it would be a good place for an internship." });
      if (!(HTE_TYPES as readonly unknown[]).includes(hteType)) return res.status(400).json({ message: "The kind is government, private or university." });
      if (auth.role === "student") {
        const open = await pool.query<{ open: number }>(
          `SELECT COUNT(*)::int AS open FROM company_requests WHERE requested_by_role = 'student' AND requested_by_id = $1 AND status IN ('submitted', 'screening')`,
          [auth.id]
        );
        if (open.rows[0].open >= OPEN_REQUESTS_PER_STUDENT) {
          return res.status(409).json({ message: `You have ${OPEN_REQUESTS_PER_STUDENT} suggestions waiting. Wait for your coordinator to decide them.` });
        }
      }
      const saved = await pool.query(
        `INSERT INTO company_requests AS r (requested_by_role, requested_by_id, company_name, hte_type, address, contact, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${REQUEST_COLUMNS}`,
        [auth.role, auth.id, name, hteType, text(req.body?.address, 300) || null, text(req.body?.contact, 200) || null, reason]
      );
      if (auth.role === "student") {
        await deps
          .notifyCoordinators({
            title: "An agency was suggested",
            message: `A student suggested ${name} as a host for internships.`,
            type: "info",
            link: "/coordinator/companies?view=requests",
          })
          .catch((error) => console.error("COMPANY REQUEST NOTIFICATION ERROR:", error));
      }
      return res.status(201).json({ message: "Suggestion sent. Your coordinator decides it.", request: saved.rows[0] });
    } catch (error) {
      console.error("ADD COMPANY REQUEST ERROR:", error);
      return res.status(500).json({ message: "Failed to send the suggestion." });
    }
  });

  app.get("/api/students/:studentId/company-requests", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own suggestions." });
      const rows = await pool.query(
        `SELECT r.id, r.company_name, r.hte_type, r.status, r.decision_note, r.decided_at, r.created_at FROM company_requests r
         WHERE r.requested_by_role = 'student' AND r.requested_by_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
        [auth.id]
      );
      return res.json({ requests: rows.rows });
    } catch (error) {
      console.error("LIST OWN COMPANY REQUESTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load your suggestions." });
    }
  });

  app.get("/api/coordinator/company-requests", requireStaff, async (_req, res) => {
    try {
      const rows = await pool.query(
        `SELECT ${REQUEST_COLUMNS}, COALESCE(st.name, co.name) AS requested_by_name
         FROM company_requests r
         LEFT JOIN students st ON r.requested_by_role = 'student' AND st.student_id = r.requested_by_id
         LEFT JOIN coordinators co ON r.requested_by_role = 'coordinator' AND co.coordinator_id = r.requested_by_id
         ORDER BY (r.status IN ('submitted', 'screening')) DESC, r.created_at DESC LIMIT 200`
      );
      return res.json({ requests: rows.rows });
    } catch (error) {
      console.error("LIST COMPANY REQUESTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the suggestions." });
    }
  });

  // screening: being looked at; approve: the company is made, in screening; reject: with a note.
  app.put("/api/coordinator/company-requests/:id/decision", requireCoordinator, async (req, res) => {
    const id = idOf(req.params.id);
    if (id === null) return res.status(404).json({ message: "Request not found." });
    const decision = req.body?.decision;
    if (!["screening", "approve", "reject"].includes(decision)) return res.status(400).json({ message: "Decide: screening, approve or reject." });
    const note = text(req.body?.note, 500) || null;
    if (decision === "reject" && !note) return res.status(400).json({ message: "Say why, so the person who suggested it knows." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ company_name: string; hte_type: string; address: string | null; contact: string | null; status: string; version: number; requested_by_role: string; requested_by_id: string }>(
        `SELECT company_name, hte_type, address, contact, status, version, requested_by_role, requested_by_id FROM company_requests WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const request = found.rows[0];
      if (!request) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Request not found." });
      }
      if (request.version !== Number(req.body?.expected_version)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "STALE", message: "Someone decided this request after you opened it. It is reloaded." });
      }
      if (request.status === "approved" || request.status === "rejected") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: `This request was already ${request.status}.` });
      }
      let companyId: number | null = null;
      if (decision === "approve") {
        const taken = await client.query(`SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`, [request.company_name]);
        if (taken.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ code: "COMPANY_EXISTS", message: `A company named ${request.company_name} is already recorded. Reject this request with a note saying so.` });
        }
        const made = await client.query<{ id: number }>(
          `INSERT INTO companies (name, address, contact_person, hte_type, status) VALUES ($1, $2, $3, $4, 'screening') RETURNING id`,
          [request.company_name, request.address, request.contact, request.hte_type]
        );
        companyId = made.rows[0].id;
      }
      const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "screening";
      const saved = await client.query(
        `UPDATE company_requests r SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4,
           company_id = COALESCE($5, company_id), version = version + 1
         WHERE id = $1 RETURNING ${REQUEST_COLUMNS}`,
        [id, status, (req as Authed).auth!.id, note, companyId]
      );
      await client.query("COMMIT");
      if (request.requested_by_role === "student" && status !== "screening") {
        await deps
          .createNotification({
            studentId: request.requested_by_id,
            title: status === "approved" ? "Your agency suggestion was accepted" : "Your agency suggestion was declined",
            message:
              status === "approved"
                ? `${request.company_name} is now being screened as a host for internships.`
                : `${request.company_name}: ${note}`,
            type: "info",
            link: "/schedule",
          })
          .catch((error) => console.error("COMPANY REQUEST DECISION NOTIFICATION ERROR:", error));
      }
      const words = { approve: `${request.company_name} is recorded and being screened.`, reject: "Request declined.", screening: "Request marked as being screened." };
      return res.json({ message: words[decision as keyof typeof words], request: saved.rows[0], company_id: companyId });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("DECIDE COMPANY REQUEST ERROR:", error);
      return res.status(500).json({ message: "Failed to decide the request." });
    } finally {
      client.release();
    }
  });
}
