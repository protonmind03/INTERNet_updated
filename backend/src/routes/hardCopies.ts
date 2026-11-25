import path from "node:path";
import type express from "express";
import type { Pool } from "pg";
import { restrictedDocument } from "../services/deliverables";
import { phToday } from "../services/phTime";
import { calendarDay } from "../services/traineeRecord";

/*
|--------------------------------------------------------------------------
| HARD COPIES RECEIVED, AND THEIR TRANSMITTAL (Phase 2.4, migration 088)
|--------------------------------------------------------------------------
|
|   GET    /api/coordinator/students/:studentId/hard-copies
|          the student's documents and final evaluations, each with its
|          hard copy if received (and whether it is a health or clearance
|          document, which the printed transmittal leaves out)
|   PUT    .../hard-copies/:recordType/:recordId     record it (multipart:
|          received_on, received_by_name, note, optional "scan")
|   DELETE .../hard-copies/:recordType/:recordId     not received after all
|   GET    .../hard-copies/:recordType/:recordId/scan   the transmittal scan
|
| Every route names the student, so a scoped coordinator reaches only their
| own students (services/coordinatorScope.ts).
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireCoordinator: express.RequestHandler;
  upload: { single: (field: string) => express.RequestHandler };
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
  readPrivateFile: (fileName: string) => Promise<{ buffer: Buffer; contentType?: string }>;
};

const RECORD_TYPES = ["document", "final_evaluation"] as const;
type RecordType = (typeof RECORD_TYPES)[number];
const SCAN_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

const HARD_COPY = `JSON_BUILD_OBJECT('received_on', TO_CHAR(h.received_on, 'YYYY-MM-DD'), 'received_by_name', h.received_by_name,
                   'note', h.note, 'has_scan', h.scan_path IS NOT NULL)`;

/** The record's student, or null when there is no such record. */
async function recordStudent(pool: Pool, type: RecordType, id: number): Promise<string | null> {
  const table = type === "document" ? "documents" : "final_evaluations";
  const found = await pool.query<{ student_id: string }>(`SELECT TRIM(student_id::text) AS student_id FROM ${table} WHERE id = $1`, [id]);
  return found.rows[0]?.student_id ?? null;
}

export function registerHardCopyRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator } = deps;

  /** The route's record, checked to belong to the route's student. */
  const readTarget = async (req: express.Request): Promise<{ type: RecordType; id: number; studentId: string } | null> => {
    const type = String(req.params.recordType) as RecordType;
    const id = Number(req.params.recordId);
    if (!RECORD_TYPES.includes(type) || !Number.isSafeInteger(id) || id < 1) return null;
    const owner = await recordStudent(pool, type, id);
    const studentId = String(req.params.studentId).trim();
    return owner && owner === studentId ? { type, id, studentId: owner } : null;
  };

  app.get("/api/coordinator/students/:studentId/hard-copies", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const student = await pool.query(
        `SELECT TRIM(s.student_id::text) AS student_id, s.student_id AS stored_id, s.name, s.company, p.short_code AS program, p.name AS program_name,
                (SELECT name FROM coordinators WHERE coordinator_id = $2) AS coordinator
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE TRIM(s.student_id::text) = TRIM($1)`,
        [req.params.studentId, auth.id]
      );
      if (student.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      // The id as stored, so the lookups below use their student_id indexes.
      const { stored_id: id, ...about } = student.rows[0];
      const [documents, evaluations] = await Promise.all([
        pool.query(
          `SELECT 'document' AS record_type, d.id AS record_id, d.doc_type AS label, d.status,
                  TO_CHAR(d.uploaded_at, 'YYYY-MM-DD') AS dated, ${restrictedDocument("d")} AS restricted,
                  CASE WHEN h.id IS NULL THEN NULL ELSE ${HARD_COPY} END AS hard_copy
           FROM documents d
           LEFT JOIN hard_copies h ON h.record_type = 'document' AND h.record_id = d.id
           WHERE d.student_id = $1
           ORDER BY d.uploaded_at DESC, d.id DESC`,
          [id]
        ),
        pool.query(
          `SELECT 'final_evaluation' AS record_type, f.id AS record_id,
                  'Final evaluation by ' || COALESCE(f.supervisor_name, 'the supervisor') AS label, 'submitted' AS status,
                  TO_CHAR(f.submitted_at, 'YYYY-MM-DD') AS dated, FALSE AS restricted,
                  CASE WHEN h.id IS NULL THEN NULL ELSE ${HARD_COPY} END AS hard_copy
           FROM final_evaluations f
           LEFT JOIN hard_copies h ON h.record_type = 'final_evaluation' AND h.record_id = f.id
           WHERE f.student_id = $1
           ORDER BY f.submitted_at DESC`,
          [id]
        ),
      ]);
      return res.json({ student: about, items: [...evaluations.rows, ...documents.rows] });
    } catch (error) {
      console.error("GET HARD COPIES ERROR:", error);
      return res.status(500).json({ message: "Failed to load the hard copies." });
    }
  });

  app.put(
    "/api/coordinator/students/:studentId/hard-copies/:recordType/:recordId",
    requireCoordinator,
    deps.upload.single("scan"),
    async (req, res) => {
      let stored: string | null = null;
      try {
        const auth = (req as Authed).auth!;
        const target = await readTarget(req);
        if (!target) return res.status(404).json({ message: "Record not found." });
        const receivedOn = String(req.body?.received_on ?? "").trim();
        const receivedBy = String(req.body?.received_by_name ?? "").trim();
        const note = String(req.body?.note ?? "").trim();
        if (!calendarDay(receivedOn)) return res.status(400).json({ message: "Give the day it was received, as YYYY-MM-DD." });
        if (receivedOn > phToday()) return res.status(400).json({ message: "That day has not come yet." });
        if (receivedBy.length < 2 || receivedBy.length > 150) return res.status(400).json({ message: "Say who received it." });
        if (note.length > 500) return res.status(400).json({ message: "Keep the note to 500 characters." });
        const file = req.file;
        if (file && SCAN_TYPES[path.extname(file.originalname).toLowerCase()] !== file.mimetype) {
          return res.status(400).json({ message: "The transmittal scan is a PDF, JPG or PNG." });
        }
        if (file) stored = await deps.savePrivateFile(file);
        const previous = await pool.query<{ scan_path: string | null }>(
          `SELECT scan_path FROM hard_copies WHERE record_type = $1 AND record_id = $2`,
          [target.type, target.id]
        );
        await pool.query(
          `INSERT INTO hard_copies (record_type, record_id, student_id, received_on, received_by_name, note, scan_path, scan_name, scan_type, recorded_by)
           VALUES ($1, $2, (SELECT student_id FROM students WHERE TRIM(student_id::text) = $3), $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (record_type, record_id) DO UPDATE SET
             received_on = EXCLUDED.received_on, received_by_name = EXCLUDED.received_by_name, note = EXCLUDED.note,
             scan_path = COALESCE(EXCLUDED.scan_path, hard_copies.scan_path),
             scan_name = COALESCE(EXCLUDED.scan_name, hard_copies.scan_name),
             scan_type = COALESCE(EXCLUDED.scan_type, hard_copies.scan_type),
             recorded_by = EXCLUDED.recorded_by, recorded_at = NOW()`,
          [
            target.type, target.id, target.studentId, receivedOn, receivedBy, note || null, stored,
            file ? file.originalname.replace(/[\r\n"]/g, "_").slice(0, 200) : null, file?.mimetype ?? null, auth.id,
          ]
        );
        // A new scan replaces the old one.
        const old = previous.rows[0]?.scan_path;
        if (stored && old) await deps.deletePrivateFile(path.basename(old)).catch(() => undefined);
        stored = null;
        return res.json({ message: "Hard copy recorded.", hard_copy: { received_on: receivedOn, received_by_name: receivedBy } });
      } catch (error) {
        if (stored) await deps.deletePrivateFile(stored).catch(() => undefined);
        console.error("RECORD HARD COPY ERROR:", error);
        return res.status(500).json({ message: "Failed to record the hard copy." });
      }
    }
  );

  app.delete("/api/coordinator/students/:studentId/hard-copies/:recordType/:recordId", requireCoordinator, async (req, res) => {
    try {
      const target = await readTarget(req);
      if (!target) return res.status(404).json({ message: "Record not found." });
      const removed = await pool.query<{ scan_path: string | null }>(
        `DELETE FROM hard_copies WHERE record_type = $1 AND record_id = $2 RETURNING scan_path`,
        [target.type, target.id]
      );
      if (removed.rows.length === 0) return res.status(404).json({ message: "No hard copy was recorded." });
      const scan = removed.rows[0].scan_path;
      if (scan) await deps.deletePrivateFile(path.basename(scan)).catch(() => undefined);
      return res.json({ message: "Hard copy taken off." });
    } catch (error) {
      console.error("REMOVE HARD COPY ERROR:", error);
      return res.status(500).json({ message: "Failed to take the hard copy off." });
    }
  });

  app.get("/api/coordinator/students/:studentId/hard-copies/:recordType/:recordId/scan", requireCoordinator, async (req, res) => {
    try {
      const target = await readTarget(req);
      if (!target) return res.status(404).json({ message: "Record not found." });
      const found = await pool.query<{ scan_path: string | null; scan_name: string | null; scan_type: string | null }>(
        `SELECT scan_path, scan_name, scan_type FROM hard_copies WHERE record_type = $1 AND record_id = $2`,
        [target.type, target.id]
      );
      const row = found.rows[0];
      if (!row?.scan_path) return res.status(404).json({ message: "No transmittal scan was kept." });
      const file = await deps.readPrivateFile(path.basename(row.scan_path));
      return res.type(row.scan_type || file.contentType || "application/octet-stream").attachment(row.scan_name || "transmittal").send(file.buffer);
    } catch (error) {
      console.error("GET TRANSMITTAL SCAN ERROR:", error);
      return res.status(500).json({ message: "Failed to open the scan." });
    }
  });
}
