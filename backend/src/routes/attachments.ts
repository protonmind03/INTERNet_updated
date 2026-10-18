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
import { offlineMaxAgeHoursFor, CLOCK_SKEW_MS } from "../services/offlineActions";

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
| PREVIEWS (Iteration 13, migration 063). The phone also makes a WebP of
| the picture at most 480 pixels on its long side and sends it beside the
| picture as `preview`. Lists show the preview (GET .../preview); the
| picture itself is fetched when it is opened. A picture with no preview
| (sent before this, or by a browser that cannot make a WebP) is shown from
| the picture itself, as before.
|
| SENT LATER. Pictures chosen for a time-out recorded with no connection
| wait on the phone and are sent after it. Each carries `client_ref`, the
| phone's id for it: sent twice onto the same entry, it is added once and
| the second answer is the picture already there. They also carry
| `occurred_at`, when the time-out was pressed: older than the time-out's
| own limit (OFFLINE_MAX_AGE_HOURS_TIME_OUT), they are refused like it.
|
*/

export const MAX_PICTURES = 3;
const MAX_BYTES = 4 * 1024 * 1024;
/** A preview is 480 pixels at most; this is well above what one weighs. */
export const PREVIEW_MAX_BYTES = 200 * 1024;
export const PREVIEW_SIDE = 480;
const CLIENT_REF = /^[A-Za-z0-9-]{8,64}$/;
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

/**
 * Why a picture sent later is too old for its entry, or null when it is not
 * (or was sent at once: no `occurred_at`). Only a time-out's pictures wait
 * on the phone, so only the attendance log's limit applies.
 */
export function lateProblem(
  type: OwnerType,
  occurredAt: unknown,
  now: Date = new Date(),
  maxAgeHours: number = offlineMaxAgeHoursFor("time-out")
): string | null {
  if (occurredAt === undefined || occurredAt === null || occurredAt === "" || type !== "attendance") return null;
  const when = typeof occurredAt === "string" ? new Date(occurredAt) : new Date(NaN);
  if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return "The time these pictures were taken is not right. Check the date and time on your phone.";
  }
  if (now.getTime() - when.getTime() > maxAgeHours * 60 * 60 * 1000) {
    return `These pictures were taken more than ${maxAgeHours} hours ago, too long for them to be added to the time-out. Show them to your supervisor instead.`;
  }
  return null;
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

  const LIST_COLUMNS = `id::int AS id, owner_type, owner_id, mime_type, size_bytes, width, height, caption, position, created_at,
                        (preview_path IS NOT NULL) AS has_preview`;

  const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 2 } }).fields([
    { name: "file", maxCount: 1 },
    { name: "preview", maxCount: 1 },
  ]);

  app.post("/api/attachments", requireRole(["student", "supervisor"]), (req, res) => {
    receive(req, res, async (uploadError?: unknown) => {
      if (uploadError) {
        const tooLarge = (uploadError as { code?: string }).code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
          message: tooLarge ? "That picture is larger than 4 MB." : "The picture could not be read.",
        });
      }
      let stored: string | undefined;
      let storedPreview: string | undefined;
      try {
        const auth = (req as Authed).auth!;
        const type = req.body?.owner_type;
        const ownerId = whole(req.body?.owner_id);
        if (!isOwnerType(type) || ownerId === null) {
          return res.status(400).json({ message: "Say which entry the picture is for." });
        }
        const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
        const picture = files.file?.[0];
        const preview = files.preview?.[0];
        if (!picture) return res.status(400).json({ message: "Choose a picture to attach." });
        // The app re-encodes pictures on the phone; this covers anything that did not.
        picture.buffer = stripImageMetadata(picture.buffer);
        const kind = pictureKind(picture.buffer);
        if (!kind) {
          return res.status(400).json({ message: "That file is not a JPG, PNG or WebP picture." });
        }
        // A preview is optional; when sent it must be a small WebP.
        if (preview) {
          preview.buffer = stripImageMetadata(preview.buffer);
          if (pictureKind(preview.buffer)?.mime !== "image/webp" || preview.buffer.length > PREVIEW_MAX_BYTES) {
            return res.status(400).json({ message: "The picture's preview could not be read. Choose the picture again." });
          }
        }
        const clientRef = typeof req.body?.client_ref === "string" && req.body.client_ref !== "" ? req.body.client_ref : null;
        if (clientRef !== null && !CLIENT_REF.test(clientRef)) {
          return res.status(400).json({ message: "The picture's id from the phone is not valid." });
        }
        const entry = await findEntry(type, ownerId);
        // The same answer for "no such entry" and "not yours", so ids cannot be probed.
        if (!entry || !isAuthor(type, entry, auth)) {
          return res.status(404).json({ message: "That entry was not found." });
        }
        // Sent before and the answer was lost: the picture already there.
        if (clientRef !== null) {
          const already = await pool.query(
            `SELECT ${LIST_COLUMNS} FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND client_ref = $3`,
            [type, ownerId, clientRef]
          );
          if (already.rows.length > 0) return res.status(200).json({ message: "Picture already attached.", attachment: already.rows[0] });
        }
        if (!entry.open) {
          return res.status(409).json({ message: "This entry has been decided, so pictures can no longer be added to it." });
        }
        const late = lateProblem(type, req.body?.occurred_at);
        if (late) return res.status(409).json({ code: "TOO_OLD", message: late });
        // The uploader's room on the server, and their files today.
        const incoming = picture.buffer.length + (preview?.buffer.length ?? 0);
        const room = quotaProblem(await uploadUsage(pool, auth.role as "student" | "supervisor", auth.id), incoming);
        if (room) return res.status(413).json({ code: "UPLOAD_QUOTA", message: room });
        const caption = typeof req.body?.caption === "string" ? req.body.caption.trim().slice(0, CAPTION_MAX) : "";
        const side = (value: unknown) => {
          const n = whole(value);
          return n !== null && n >= 1 && n <= 20000 ? n : null;
        };

        stored = await savePrivateFile(
          { ...picture, mimetype: kind.mime } as Express.Multer.File,
          newStoredFileName(`picture${kind.extension}`)
        );
        if (preview) {
          storedPreview = await savePrivateFile(
            { ...preview, mimetype: "image/webp" } as Express.Multer.File,
            newStoredFileName("preview.webp")
          );
        }
        // Counted and added in one statement, so two uploads at once cannot both take the last place.
        let added;
        try {
          added = await pool.query(
            `INSERT INTO attachments
               (owner_type, owner_id, student_id, uploaded_by_role, uploaded_by_id, file_path, mime_type,
                size_bytes, width, height, sha256, caption, position, preview_path, preview_size_bytes, client_ref)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                    COALESCE((SELECT MAX(position) + 1 FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND removed_at IS NULL), 0),
                    $14, $15, $16
             WHERE (SELECT COUNT(*) FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND removed_at IS NULL) < $13
             RETURNING ${LIST_COLUMNS}`,
            [
              type, ownerId, entry.studentId, auth.role, auth.id, `/uploads/${stored}`, kind.mime,
              picture.buffer.length, side(req.body?.width), side(req.body?.height),
              createHash("sha256").update(picture.buffer).digest("hex"), caption || null, MAX_PICTURES,
              storedPreview ? `/uploads/${storedPreview}` : null, preview?.buffer.length ?? null, clientRef,
            ]
          );
        } catch (insertError) {
          // The same picture, sent twice at once: the other upload added it.
          if ((insertError as { code?: string }).code !== "23505" || clientRef === null) throw insertError;
          await deletePrivateFile(stored).catch(() => undefined);
          if (storedPreview) await deletePrivateFile(storedPreview).catch(() => undefined);
          stored = storedPreview = undefined;
          const already = await pool.query(
            `SELECT ${LIST_COLUMNS} FROM attachments WHERE owner_type = $1 AND owner_id = $2 AND client_ref = $3`,
            [type, ownerId, clientRef]
          );
          return res.status(200).json({ message: "Picture already attached.", attachment: already.rows[0] });
        }
        if (added.rows.length === 0) {
          await deletePrivateFile(stored).catch(() => undefined);
          if (storedPreview) await deletePrivateFile(storedPreview).catch(() => undefined);
          return res.status(409).json({ message: `An entry can have at most ${MAX_PICTURES} pictures.` });
        }
        await recordUpload(pool, auth.role as "student" | "supervisor", auth.id, "picture", incoming, {
          table: "attachments",
          id: Number(added.rows[0].id),
        }).catch((ledgerError) => console.error("UPLOAD LEDGER ERROR:", ledgerError));
        return res.status(201).json({ message: "Picture attached.", attachment: added.rows[0] });
      } catch (error) {
        if (stored) await deletePrivateFile(stored).catch(() => undefined);
        if (storedPreview) await deletePrivateFile(storedPreview).catch(() => undefined);
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

  // The picture itself, or (`/preview`) its small WebP; who may see one may see the other.
  const sendPicture = (which: "file" | "preview") => async (req: express.Request, res: express.Response) => {
    try {
      const auth = (req as Authed).auth!;
      const id = whole(req.params.id);
      const found =
        id === null
          ? { rows: [] }
          : await pool.query<{
              owner_type: OwnerType;
              owner_id: number;
              file_path: string;
              mime_type: string;
              student_id: string | null;
              preview_path: string | null;
            }>(
              `SELECT owner_type, owner_id, file_path, mime_type, student_id, preview_path FROM attachments WHERE id = $1 AND removed_at IS NULL`,
              [id]
            );
      const row = found.rows[0];
      const entry = row ? await findEntry(row.owner_type, row.owner_id) : null;
      if (!row || !entry || !maySee(row.owner_type, entry, auth) || (which === "preview" && !row.preview_path)) {
        return res.status(404).json({ message: "Picture not found." });
      }
      const path = which === "preview" ? row.preview_path! : row.file_path;
      const file = await readPrivateFile(path.replace(/^\/uploads\//, ""));
      // For the audit log: whose entry it was and what kind (services/audit.ts).
      res.locals.auditNote = { student_id: row.student_id, owner_type: row.owner_type, owner_id: row.owner_id };
      res.setHeader("Content-Type", which === "preview" ? "image/webp" : row.mime_type);
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
  };
  app.get("/api/attachments/:id/file", requireRole(["student", "supervisor", "coordinator"]), sendPicture("file"));
  app.get("/api/attachments/:id/preview", requireRole(["student", "supervisor", "coordinator"]), sendPicture("preview"));

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
