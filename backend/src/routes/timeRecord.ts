import { createHash } from "node:crypto";
import type express from "express";
import type { Pool } from "pg";
import { loadInstitution } from "./institution";
import { recordUpload, quotaProblem, uploadUsage } from "../services/uploadQuota";
import { sameId } from "../services/ids";

/*
|--------------------------------------------------------------------------
| THE TIME RECORD'S HEADER, AND THE TRAINEE'S SIGNATURE
|--------------------------------------------------------------------------
|
| Iteration 20 (migrations 067 and 068).
|
| GET /api/time-record/:studentId/header
|   Everything printed above and beside the Daily Time Record's grid, in one
|   answer the app keeps for offline use: the institution's lines, the
|   college and the program's formal name, the trainee's details (block,
|   company, supervisor, required and verified hours), and the active
|   signature. Read live, so a log decided a moment ago shows in the
|   verified hours.
|
| GET/PUT/DELETE /api/student/signature
|   The trainee's own signature: an image of their handwriting, not a
|   cryptographic signature. PUT replaces it (the old one is revoked, kept
|   for the months certified with it); DELETE revokes it. The PNG goes
|   through services/privateFileStore.ts and counts against the upload
|   quota as kind "signature".
|
| GET /api/students/:studentId/signature
|   Another person's view of it, for the Time Record: the trainee's
|   supervisor, and coordinators (audited, at most once in ten minutes;
|   services/audit.ts). `?id=` reads a certified month's signature, even
|   one revoked since.
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: string | string[]) => express.RequestHandler;
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
  readPrivateFile: (fileName: string) => Promise<{ buffer: Buffer; contentType?: string }>;
};

/** The PNG the app makes: 600 x 200, transparent. A little room either way for an uploaded image. */
export const SIGNATURE_PNG = { width: 600, height: 200, maxBytes: 70_000 } as const;
/** The stroke paths: SVG path data only (M, L, Q, C, Z and numbers). */
const SVG_PATHS = /^[MLQCZmlqcz0-9.,\s-]*$/;

type SignatureRow = {
  id: number;
  student_id: string;
  file_path: string;
  svg_paths: string;
  sha256: string;
  width: number;
  height: number;
  created_at: string;
  revoked_at: string | null;
};

/** A signature PUT's body, checked: SVG paths and a PNG as a data URL, or what is wrong. */
export function readSignature(body: unknown): { problem: string } | { png: Buffer; svg: string; width: number; height: number } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const svg = typeof input.svg_paths === "string" ? input.svg_paths.trim() : "";
  if (svg.length > 60_000 || !SVG_PATHS.test(svg)) return { problem: "The signature's strokes could not be read. Draw it again." };
  const data = typeof input.png === "string" ? input.png : "";
  const match = data.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { problem: "Send the signature as a PNG image." };
  const png = Buffer.from(match[1], "base64");
  if (png.length > SIGNATURE_PNG.maxBytes) return { problem: "The signature image is too large. Draw it again, or upload a smaller image." };
  if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47) return { problem: "Send the signature as a PNG image." };
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== SIGNATURE_PNG.width || height !== SIGNATURE_PNG.height) {
    return { problem: `The signature image must be ${SIGNATURE_PNG.width} by ${SIGNATURE_PNG.height} pixels.` };
  }
  // An empty pad: no strokes and nothing drawn. An upload has no strokes but is an image.
  if (!svg && input.uploaded !== true) return { problem: "The pad is empty. Sign on it first." };
  return { png, svg, width, height };
}

export function registerTimeRecordRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, savePrivateFile, deletePrivateFile, readPrivateFile } = deps;

  /** May this account read this trainee's record? The trainee, their supervisor, a coordinator. */
  async function mayRead(auth: { role: string; id: string }, studentId: string): Promise<boolean> {
    if (auth.role === "coordinator") return true;
    if (auth.role === "student") return sameId(auth.id, studentId);
    if (auth.role === "supervisor") {
      const mine = await pool.query(`SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`, [studentId, auth.id]);
      return mine.rows.length > 0;
    }
    return false;
  }

  /** The signature as the app shows it: its stroke paths, and the PNG as a data URL for the fallback. */
  async function present(row: SignatureRow | undefined) {
    if (!row) return null;
    let png: string | null = null;
    try {
      const file = await readPrivateFile(row.file_path);
      png = `data:image/png;base64,${file.buffer.toString("base64")}`;
    } catch (error) {
      console.error("SIGNATURE FILE READ ERROR:", error);
    }
    return {
      id: row.id,
      svg_paths: row.svg_paths,
      png,
      width: row.width,
      height: row.height,
      created_at: row.created_at,
      revoked_at: row.revoked_at,
    };
  }

  const activeSignature = async (studentId: string) =>
    (
      await pool.query<SignatureRow>(
        `SELECT * FROM student_signatures WHERE student_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`,
        [studentId]
      )
    ).rows[0];

  app.get("/api/time-record/:studentId/header", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const studentId = String(req.params.studentId);
      if (!(await mayRead(auth, studentId))) return res.status(403).json({ message: "You cannot see this time record." });
      const found = await pool.query<{
        student_id: string;
        name: string;
        program: string | null;
        program_name: string | null;
        formal_name: string | null;
        college: string | null;
        block: string | null;
        company: string | null;
        supervisor: string | null;
        required_hours: string | null;
        verified_hours: string;
      }>(
        `SELECT s.student_id, s.name, s.program,
                p.name AS program_name, p.formal_name, c.name AS college,
                CASE WHEN b.id IS NULL THEN NULL ELSE bp.short_code || ' ' || b.year_level || UPPER(TRIM(b.section)) END AS block,
                s.company, sup.name AS supervisor, s.required_hours,
                (SELECT COALESCE(SUM(a.hours), 0) FROM attendance a WHERE a.student_id = s.student_id AND a.status = 'Verified') AS verified_hours
         FROM students s
         LEFT JOIN programs p ON p.id = s.program_id
         LEFT JOIN colleges c ON c.id = p.college_id
         LEFT JOIN blocks b ON b.id = s.block_id
         LEFT JOIN programs bp ON bp.id = b.program_id
         LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
         WHERE s.student_id = $1`,
        [studentId]
      );
      const student = found.rows[0];
      if (!student) return res.status(404).json({ message: "Student not found." });
      const signature = await activeSignature(studentId);
      return res.json({
        institution: await loadInstitution(pool),
        trainee: {
          student_id: student.student_id,
          name: student.name,
          // The college line is left out when the trainee has no linked program.
          college: student.program_name ? student.college : null,
          program: student.formal_name || student.program_name || student.program || null,
          program_linked: Boolean(student.program_name),
          block: student.block,
          company: student.company,
          supervisor: student.supervisor,
          required_hours: student.required_hours === null ? null : Number(student.required_hours),
          verified_hours: Number(student.verified_hours) || 0,
        },
        signature: signature ? { id: signature.id, created_at: signature.created_at } : null,
      });
    } catch (error) {
      console.error("TIME RECORD HEADER ERROR:", error);
      return res.status(500).json({ message: "Failed to load the time record's details." });
    }
  });

  app.get("/api/student/signature", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      return res.json({ signature: await present(await activeSignature(auth.id)) });
    } catch (error) {
      console.error("GET SIGNATURE ERROR:", error);
      return res.status(500).json({ message: "Failed to load your signature." });
    }
  });

  app.put("/api/student/signature", requireRole("student"), async (req, res) => {
    const read = readSignature(req.body);
    if ("problem" in read) return res.status(400).json({ message: read.problem });
    const auth = (req as Authed).auth!;
    let saved: string | undefined;
    const client = await pool.connect();
    try {
      const problem = quotaProblem(await uploadUsage(pool, "student", auth.id), read.png.length);
      if (problem) return res.status(413).json({ code: "UPLOAD_QUOTA", message: problem });
      saved = await savePrivateFile({ buffer: read.png, originalname: "signature.png", mimetype: "image/png", size: read.png.length } as Express.Multer.File);
      await client.query("BEGIN");
      await client.query(`UPDATE student_signatures SET revoked_at = NOW() WHERE student_id = $1 AND revoked_at IS NULL`, [auth.id]);
      const inserted = await client.query<SignatureRow>(
        `INSERT INTO student_signatures (student_id, file_path, svg_paths, sha256, width, height)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [auth.id, saved, read.svg, createHash("sha256").update(read.png).digest("hex"), read.width, read.height]
      );
      await client.query("COMMIT");
      await recordUpload(pool, "student", auth.id, "signature", read.png.length).catch((error) => console.error("UPLOAD LEDGER ERROR:", error));
      return res.json({ message: "Signature saved.", signature: await present(inserted.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (saved) await deletePrivateFile(saved).catch(() => undefined);
      console.error("SAVE SIGNATURE ERROR:", error);
      return res.status(500).json({ message: "Failed to save your signature." });
    } finally {
      client.release();
    }
  });

  app.delete("/api/student/signature", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      // Revoked, not deleted: a month already certified keeps the signature it was certified with.
      const revoked = await pool.query(
        `UPDATE student_signatures SET revoked_at = NOW() WHERE student_id = $1 AND revoked_at IS NULL RETURNING id`,
        [auth.id]
      );
      if (revoked.rows.length === 0) return res.status(404).json({ message: "You have no signature saved." });
      return res.json({ message: "Signature removed." });
    } catch (error) {
      console.error("REMOVE SIGNATURE ERROR:", error);
      return res.status(500).json({ message: "Failed to remove your signature." });
    }
  });

  app.get("/api/students/:studentId/signature", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const studentId = String(req.params.studentId);
      if (!(await mayRead(auth, studentId))) return res.status(403).json({ message: "You cannot see this signature." });
      const wanted = /^\d{1,9}$/.test(String(req.query.id ?? "")) ? Number(req.query.id) : null;
      const row = wanted
        ? (await pool.query<SignatureRow>(`SELECT * FROM student_signatures WHERE id = $1 AND student_id = $2`, [wanted, studentId])).rows[0]
        : await activeSignature(studentId);
      res.locals.auditNote = { student_id: studentId };
      return res.json({ signature: await present(row) });
    } catch (error) {
      console.error("GET STUDENT SIGNATURE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the signature." });
    }
  });
}
