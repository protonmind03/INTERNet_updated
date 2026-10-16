import { createHash } from "node:crypto";
import type express from "express";
import multer from "multer";
import type { Pool } from "pg";
import {
  deletePrivateFile,
  newStoredFileName,
  readPrivateFile,
  savePrivateFile,
} from "../services/privateFileStore";
import { stripImageMetadata } from "../services/imageMetadata";
import { quotaProblem, recordUpload, uploadUsage } from "../services/uploadQuota";
import { sameId } from "../services/ids";

/*
|--------------------------------------------------------------------------
| PICTURES ATTACHED TO AN ENTRY
|--------------------------------------------------------------------------
|
| Up to three pictures on the note written at time-out (an attendance
| log), on a weekly report (a journal) and on a concern (a complaint).
| Migration 050 has the table.
|
| WHO MAY ADD ONE: whoever wrote the entry, and only while it can still
| change: a log that is still waiting for review, a weekly report not yet
| reviewed, a concern not yet resolved or dismissed.
|
| WHO MAY SEE ONE: whoever may see the entry.
|   a log or weekly report   the student, their supervisor, coordinators
|   a concern                whoever filed it, and coordinators. NOT the
|                            student's supervisor: a concern may be about
|                            them.
|
| A picture is a JPEG, PNG or WebP of at most 4 MB. The app shrinks and
| re-encodes it before sending, which also drops the camera's location
| data; the server checks the first bytes are really that kind of image
| and works out the size and SHA-256 itself. The file is kept where every
| upload is and is only ever sent back by the route below.
|
| Taking a picture off an entry marks it removed. The row and the file
| stay: nothing is deleted while its entry stands.
|
*/

export const MAX_PICTURES = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const CAPTION_MAX = 200;

type OwnerType = "attendance" | "journal" | "complaint";
type Auth = { role: "student" | "supervisor" | "coordinator"; id: string };
type Authed = express.Request & { auth?: Auth };

/** What the first bytes of each accepted kind of picture are. */
const KINDS: { mime: string; extension: string; matches: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", extension: ".jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    extension: ".png",
    matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    extension: ".webp",
    matches: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

/** The kind of picture these bytes are, whatever the browser called them. Null when none. */
export function pictureKind(buffer: Buffer) {
  return KINDS.find((kind) => kind.matches(buffer)) ?? null;
}

/** The entry a picture hangs on, as far as access is concerned. */
type Entry = {
  /** The student the entry belongs to; null for a concern a supervisor filed. */
  studentId: string | null;
  /** The supervisor who filed it, for a concern filed by one. */
  filedBySupervisor: string | null;
  /** The supervisor of the entry's student. */
  supervisorOfStudent: string | null;
  /** Whether the entry can still change. */
  open: boolean;
};

const whole = (value: unknown): number | null =>
  /^[0-9]{1,9}$/.test(String(value ?? "")) ? Number(value) : null;

const isOwnerType = (value: unknown): value is OwnerType =>
  value === "attendance" || value === "journal" || value === "complaint";

/** Who wrote the entry: the only one who may add to it or take from it. */
export function isAuthor(type: OwnerType, entry: Entry, auth: Auth): boolean {
  if (auth.role === "student") return sameId(entry.studentId, auth.id) && !(type === "complaint" && entry.filedBySupervisor);
  if (auth.role === "supervisor") return type === "complaint" && sameId(entry.filedBySupervisor, auth.id);
  return false;
}

/** Who may see the entry's pictures. */
export function maySee(type: OwnerType, entry: Entry, auth: Auth): boolean {
  if (auth.role === "coordinator") return true;
  if (isAuthor(type, entry, auth)) return true;
  // A supervisor sees their own interns' logs and weekly reports, never their concerns.
  return auth.role === "supervisor" && type !== "complaint" && sameId(entry.supervisorOfStudent, auth.id);
}

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Auth["role"] | Auth["role"][]) => express.RequestHandler;
};

export function registerAttachmentRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole } = deps;

  async function findEntry(type: OwnerType, id: number): Promise<Entry | null> {
    const sql: Record<OwnerType, string> = {
      attendance: `SELECT a.student_id, NULL AS filed_by, s.supervisor_id, (a.status = 'Pending') AS open
                   FROM attendance a LEFT JOIN students s ON s.student_id = a.student_id WHERE a.id = $1`,
      journal: `SELECT j.student_id, NULL AS filed_by, s.supervisor_id, (j.status <> 'Reviewed') AS open
                FROM journals j LEFT JOIN students s ON s.student_id = j.student_id WHERE j.id = $1`,
      complaint: `SELECT c.student_id, c.filed_by_supervisor_id AS filed_by, s.supervisor_id,
                         (c.status NOT IN ('Resolved', 'Dismissed')) AS open
                  FROM complaints c LEFT JOIN students s ON s.student_id = c.student_id WHERE c.id = $1`,
    };
    const found = await pool.query<{ student_id: string | null; filed_by: string | null; supervisor_id: string | null; open: boolean }>(
      sql[type],
      [id]
    );
    if (found.rows.length === 0) return null;
    const row = found.rows[0];
    return {
      studentId: row.student_id === null ? null : String(row.student_id),
      filedBySupervisor: row.filed_by === null ? null : String(row.filed_by),
      supervisorOfStudent: row.supervisor_id === null ? null : String(row.supervisor_id),
      open: row.open,
    };
  }

  const LIST_COLUMNS = `id::int AS id, owner_type, owner_id, mime_type, size_bytes, width, height, caption, position, created_at`;

  const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

  app.post("/api/attachments", requireRole(["student", "supervisor"]), (req, res) => {
    receive(req, res, async (uploadError?: unknown) => {
      if (uploadError) {
        const tooLarge = (uploadError as { code?: string }).code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
          message: tooLarge ? "That picture is larger than 4 MB." : "The picture could not be read.",
        });
      }
      let stored: string | undefined;
      try {
        const auth = (req as Authed).auth!;
        const type = req.body?.owner_type;
        const ownerId = whole(req.body?.owner_id);
        if (!isOwnerType(type) || ownerId === null) {
          return res.status(400).json({ message: "Say which entry the picture is for." });
        }
        if (!req.file) return res.status(400).json({ message: "Choose a picture to attach." });
        // The app re-encodes pictures on the phone; this covers anything that did not.
        req.file.buffer = stripImageMetadata(req.file.buffer);
        const kind = pictureKind(req.file.buffer);
        if (!kind) {
          return res.status(400).json({ message: "That file is not a JPG, PNG or WebP picture." });
        }
        const entry = await findEntry(type, ownerId);
        // The same answer for "no such entry" and "not yours", so ids cannot be probed.
        if (!entry || !isAuthor(type, entry, auth)) {
          return res.status(404).json({ message: "That entry was not found." });
        }
        if (!entry.open) {
          return res.status(409).json({ message: "This entry has been decided, so pictures can no longer be added to it." });
        }
        // The uploader's room on the server, and their files today.
        const room = quotaProblem(await uploadUsage(pool, auth.role as "student" | "supervisor", auth.id), req.file.buffer.length);
        if (room) return res.status(413).json({ code: "UPLOAD_QUOTA", message: room });
        const caption = typeof req.body?.caption === "string" ? req.body.caption.trim().slice(0, CAPTION_MAX) : "";
        const side = (value: unknown) => {
          const n = whole(value);
          return n !== null && n >= 1 && n <= 20000 ? n : null;
        };

        stored = await savePrivateFile(
          { ...req.file, mimetype: kind.mime } as Express.Multer.File,
          newStoredFileName(`picture${kind.extension}`)
        );
        // Counted and added in one statement, so two uploads at once cannot both take the last place.
        const added = await pool.query(
          `INSERT INTO attachments
             (owner_type, owner_id, student_id, uploaded_by_role, uploaded_by_id, file_path, mime_type,
              size_bytes, width, height, sha256, caption, position)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                  COALESCE((SELECT MAX(position) + 1 FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND removed_at IS NULL), 0)
           WHERE (SELECT COUNT(*) FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND removed_at IS NULL) < $13
           RETURNING ${LIST_COLUMNS}`,
          [
            type, ownerId, entry.studentId, auth.role, auth.id, `/uploads/${stored}`, kind.mime,
            req.file.buffer.length, side(req.body?.width), side(req.body?.height),
            createHash("sha256").update(req.file.buffer).digest("hex"), caption || null, MAX_PICTURES,
          ]
        );
        if (added.rows.length === 0) {
          await deletePrivateFile(stored).catch(() => undefined);
          return res.status(409).json({ message: `An entry can have at most ${MAX_PICTURES} pictures.` });
        }
        await recordUpload(pool, auth.role as "student" | "supervisor", auth.id, "picture", req.file.buffer.length, {
          table: "attachments",
          id: Number(added.rows[0].id),
        }).catch((ledgerError) => console.error("UPLOAD LEDGER ERROR:", ledgerError));
        return res.status(201).json({ message: "Picture attached.", attachment: added.rows[0] });
      } catch (error) {
        if (stored) await deletePrivateFile(stored).catch(() => undefined);
        console.error("ATTACH PICTURE ERROR:", error);
        return res.status(500).json({ message: "Failed to attach the picture." });
      }
    });
  });

  // The pictures on one entry, without the pictures themselves.
  app.get("/api/attachments", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const type = req.query.owner_type;
      const ownerId = whole(req.query.owner_id);
      if (!isOwnerType(type) || ownerId === null) {
        return res.status(400).json({ message: "Say which entry's pictures are wanted." });
      }
      const entry = await findEntry(type, ownerId);
      if (!entry || !maySee(type, entry, auth)) return res.json({ attachments: [], can_add: false, max: MAX_PICTURES });
      const found = await pool.query(
        `SELECT ${LIST_COLUMNS} FROM attachments
         WHERE owner_type = $1 AND owner_id = $2 AND removed_at IS NULL
         ORDER BY position, id`,
        [type, ownerId]
      );
      return res.json({
        attachments: found.rows,
        can_add: entry.open && isAuthor(type, entry, auth),
        max: MAX_PICTURES,
      });
    } catch (error) {
      console.error("LIST PICTURES ERROR:", error);
      return res.status(500).json({ message: "Failed to load the pictures." });
    }
  });

  app.get("/api/attachments/:id/file", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const id = whole(req.params.id);
      const found =
        id === null
          ? { rows: [] }
          : await pool.query<{ owner_type: OwnerType; owner_id: number; file_path: string; mime_type: string; student_id: string | null }>(
              `SELECT owner_type, owner_id, file_path, mime_type, student_id FROM attachments WHERE id = $1 AND removed_at IS NULL`,
              [id]
            );
      const row = found.rows[0];
      const entry = row ? await findEntry(row.owner_type, row.owner_id) : null;
      if (!row || !entry || !maySee(row.owner_type, entry, auth)) {
        return res.status(404).json({ message: "Picture not found." });
      }
      const file = await readPrivateFile(row.file_path.replace(/^\/uploads\//, ""));
      // For the audit log: whose entry it was and what kind (services/audit.ts).
      res.locals.auditNote = { student_id: row.student_id, owner_type: row.owner_type, owner_id: row.owner_id };
      res.setHeader("Content-Type", row.mime_type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      return res.send(file.buffer);
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) {
        return res.status(404).json({ message: "Picture not found." });
      }
      console.error("READ PICTURE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the picture." });
    }
  });

  // Takes a picture off its entry. It is marked, not deleted.
  app.delete("/api/attachments/:id", requireRole(["student", "supervisor"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const id = whole(req.params.id);
      const found =
        id === null
          ? { rows: [] }
          : await pool.query<{ owner_type: OwnerType; owner_id: number }>(
              `SELECT owner_type, owner_id FROM attachments WHERE id = $1 AND removed_at IS NULL`,
              [id]
            );
      const row = found.rows[0];
      const entry = row ? await findEntry(row.owner_type, row.owner_id) : null;
      if (!row || !entry || !isAuthor(row.owner_type, entry, auth)) {
        return res.status(404).json({ message: "Picture not found." });
      }
      if (!entry.open) {
        return res.status(409).json({ message: "This entry has been decided, so its pictures can no longer be changed." });
      }
      await pool.query(`UPDATE attachments SET removed_at = NOW() WHERE id = $1 AND removed_at IS NULL`, [id]);
      return res.json({ message: "Picture removed." });
    } catch (error) {
      console.error("REMOVE PICTURE ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the picture." });
    }
  });
}
