import { randomUUID } from "node:crypto";
import type express from "express";
import jwt from "jsonwebtoken";
import type { Pool, PoolClient } from "pg";
import { offlineLimits, offlineMaxAgeHoursFor, readClockSkew, readOfflineStamp } from "../services/offlineActions";
import {
  attestationMessage,
  clockCheck,
  keyThumbprint,
  MAX_DEVICE_KEYS,
  readAttestation,
  readPublicJwk,
  signatureValid,
  VOUCHER_DAYS_AHEAD,
  VOUCHERS_AT_ONCE,
  type PublicJwk,
} from "../services/offlineAttestation";
import { isLivenessPrompt, pickLivenessPrompts, requiredPrompts, type LivenessLevel } from "../services/liveness";
import { consentRequired, hasCurrentConsent } from "../services/privacy";
import { phSql, phToday } from "../services/phTime";
import { PASSKEY_STEPS, stepOptions } from "../services/passkeys";
import { correctedTime, judgeTimeIn, loadDayPlan, loadDayRuleSettings, planForApp } from "../services/dayRules";

/*
|--------------------------------------------------------------------------
| TIME-IN WITH NO CONNECTION
|--------------------------------------------------------------------------
|
| A student with no signal records their time-in on the phone, with the
| time the button was pressed, and it arrives here when the connection is
| back (lib/offlineQueue.ts on the phone). It comes in one of two ways.
|
| With a photo (attested): the phone ran the camera check with the prompts
| of a voucher it collected while online, and signed a record of it with
| its own key (services/offlineAttestation.ts). Every part is checked
| below; a refusal names what failed. The log gets its photo, is marked
| recorded offline, and keeps what was checked in offline_attestation. A
| phone clock moved while offline is not refused: the log says so.
|
| Without a photo: the camera or the face-tracking files were not
| available. This is the body the app has always sent, answered exactly as
| before: no photo, no check, and the supervisor confirms it knowingly.
|
| Either way the log is "Pending" and can only be verified one log at a
| time (the status route asks for `confirm_offline_time_in`), so it never
| goes through "Verify all".
|
| The time is checked the way the other offline steps are
| (services/offlineActions.ts): not in the future, not older than the
| limit (12 hours unless OFFLINE_ACTION_MAX_AGE_HOURS says otherwise).
| The log belongs to the day in the Philippines that the time falls on.
|
| A day has one log. If the day already has one, nothing is added, and
| the answer carries that log's id so the phone can attach the lunch and
| time-out steps it was holding to it. If the day's log is this very
| time-in, sent a second time, the answer is the same as the first.
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (role: "student") => express.RequestHandler;
  createNotification: (notification: {
    supervisorId?: string;
    title: string;
    message: string;
    type: string;
    entity?: { type: string; id: string | number };
  }) => Promise<void>;
  /** Reads a multipart photo, when there is one; a JSON body passes through untouched. */
  photoUpload: express.RequestHandler;
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
  jwtSecret: string;
};

const LOG_COLUMNS = `
  id, student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, time_in, break_time, break_end_time,
  time_out, hours, note, status, image_url, capture_method, recorded_offline,
  (offline_time_in_request IS NOT NULL) AS offline_time_in,
  session, credited_from, late_minutes, TO_CHAR(scheduled_start, 'HH24:MI') AS scheduled_start, lunch_late_minutes
`;

/** A refusal: the status, a code the app can act on, and a sentence for the student. */
type Refusal = { status: 400 | 409; code: string; message: string };
const refuse = (status: 400 | 409, code: string, message: string): Refusal => ({ status, code, message });

type VoucherClaims = {
  purpose: "offline-voucher";
  sub: string;
  jti: string;
  date: string;
  level: LivenessLevel;
  prompts: string[];
  spare: string | null;
  key_id: string;
  offset_ms: number;
};

export function registerOfflineTimeInRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, createNotification, photoUpload, savePrivateFile, deletePrivateFile, jwtSecret } = deps;

  /*
  |--------------------------------------------------------------------------
  | THE PHONE'S KEY
  |--------------------------------------------------------------------------
  |
  | The app registers the public half of its key once per student. A key is
  | known by its thumbprint. A student may have MAX_DEVICE_KEYS at once; a
  | new one past that retires the oldest. A retired key stays retired.
  |
  */

  /**
   * How old each kind of step recorded offline may be when it arrives (Iteration 12),
   * so the phone's "Waiting to send" panel can say until when each one can still go.
   */
  app.get("/api/offline/limits", requireRole("student"), (_req, res) => {
    const hours = offlineLimits();
    return res.json({ hours: { time_in: hours["time-in"], lunch: hours.lunch, time_out: hours["time-out"] } });
  });

  app.post("/api/attendance/device-key", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const read = readPublicJwk(req.body?.public_key_jwk);
      if ("problem" in read) return res.status(400).json({ code: "DEVICE_KEY_UNREADABLE", message: read.problem });
      const keyId = keyThumbprint(read.jwk);
      const saved = await pool.query<{ revoked_at: Date | null }>(
        `INSERT INTO device_keys (student_id, key_id, public_key_jwk)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (student_id, key_id) DO UPDATE SET key_id = EXCLUDED.key_id
         RETURNING revoked_at`,
        [auth.id, keyId, JSON.stringify(read.jwk)]
      );
      if (saved.rows[0].revoked_at) {
        return res.status(409).json({
          code: "DEVICE_REVOKED",
          message: "This phone's key was retired. Sign out and in again on this phone to make a new one.",
        });
      }
      await pool.query(
        `UPDATE device_keys SET revoked_at = NOW()
         WHERE student_id = $1 AND revoked_at IS NULL
           AND id NOT IN (
             SELECT id FROM device_keys WHERE student_id = $1 AND revoked_at IS NULL
             ORDER BY created_at DESC, id DESC LIMIT $2
           )`,
        [auth.id, MAX_DEVICE_KEYS]
      );
      return res.json({ key_id: keyId });
    } catch (error) {
      console.error("DEVICE KEY ERROR:", error);
      return res.status(500).json({ message: "Failed to register this phone." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | VOUCHERS
  |--------------------------------------------------------------------------
  |
  | Up to two, for the student's next scheduled days from today (a day on
  | the weekly schedule, not a holiday, with no log yet), each bound to the
  | phone's key. Asking again hands out the same unspent voucher for a day
  | (a time-in waiting on the phone may carry it), unless the student's
  | level has changed since. The phone's clock gap is measured from
  | `client_sent_at` when a voucher is made, and kept with it.
  |
  */

  app.post("/api/attendance/offline-vouchers", requireRole("student"), async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const auth = (req as Authed).auth!;
      const keyId = typeof req.body?.key_id === "string" ? req.body.key_id : "";
      const key = await pool.query<{ id: number }>(
        `SELECT id FROM device_keys WHERE student_id = $1 AND key_id = $2 AND revoked_at IS NULL`,
        [auth.id, keyId]
      );
      if (key.rows.length === 0) {
        return res.status(400).json({ code: "DEVICE_UNKNOWN", message: "Register this phone before asking for vouchers." });
      }
      const skew = readClockSkew(req.body);
      if (skew === null) {
        return res.status(400).json({ message: "Send this phone's clock (client_sent_at) to get vouchers." });
      }
      const offsetMs = Date.parse(String(req.body.client_sent_at)) - Date.now();

      const student = await pool.query<{ liveness_strict: boolean }>(
        `SELECT liveness_strict FROM students WHERE student_id = $1`,
        [auth.id]
      );
      const level: LivenessLevel = student.rows[0]?.liveness_strict ? "strict" : "standard";
      const days = await pool.query<{ day: string }>(
        `SELECT TO_CHAR(d, 'YYYY-MM-DD') AS day
         FROM generate_series(${phSql.today}, ${phSql.today} + $2::int, INTERVAL '1 day') AS d
         WHERE EXISTS (
                 SELECT 1 FROM ojt_schedule o
                 JOIN students st ON st.student_id = o.student_id
                 WHERE o.student_id = $1 AND o.is_active = TRUE
                   AND INITCAP(TRIM(o.day)) = TRIM(TO_CHAR(d, 'Day'))
                   AND COALESCE(o.week, 1) = ojt_pattern_week(st.schedule_anchor, st.schedule_weeks, d::date)
               )
           AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
           AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = $1 AND a.date = d::date)
         ORDER BY d
         LIMIT $3`,
        [auth.id, VOUCHER_DAYS_AHEAD - 1, VOUCHERS_AT_ONCE]
      );

      client = await pool.connect();
      await client.query("BEGIN");
      // Unspent vouchers for days already past are of no more use.
      await client.query(
        `DELETE FROM offline_vouchers WHERE student_id = $1 AND used_at IS NULL AND valid_date < ${phSql.today}`,
        [auth.id]
      );
      const vouchers = [];
      for (const { day } of days.rows) {
        // An unspent voucher this phone already holds for the day is handed
        // out again, not replaced: a time-in waiting on the phone may carry
        // it, and is often sent at the very moment the phone asks again (the
        // connection has just come back). Only a change of level since it
        // was given (strict on or off) replaces it.
        const held = await client.query<{ jti: string; prompts: { level: LivenessLevel; prompts: string[]; spare: string | null }; server_offset_ms: number }>(
          `SELECT jti, prompts, server_offset_ms FROM offline_vouchers
           WHERE student_id = $1 AND device_key_id = $2 AND valid_date = $3::date AND used_at IS NULL
           ORDER BY issued_at DESC LIMIT 1`,
          [auth.id, key.rows[0].id, day]
        );
        let jti: string;
        let given: { level: LivenessLevel; prompts: string[]; spare: string | null };
        let offset: number;
        if (held.rows.length > 0 && held.rows[0].prompts.level === level) {
          ({ jti, prompts: given, server_offset_ms: offset } = held.rows[0]);
        } else {
          await client.query(
            `DELETE FROM offline_vouchers
             WHERE student_id = $1 AND device_key_id = $2 AND valid_date = $3::date AND used_at IS NULL`,
            [auth.id, key.rows[0].id, day]
          );
          jti = randomUUID();
          given = { level, ...pickLivenessPrompts(level) };
          offset = offsetMs;
          await client.query(
            `INSERT INTO offline_vouchers (jti, student_id, device_key_id, valid_date, prompts, server_offset_ms)
             VALUES ($1, $2, $3, $4::date, $5::jsonb, $6)`,
            [jti, auth.id, key.rows[0].id, day, JSON.stringify(given), offset]
          );
        }
        // Good until the day is over in the Philippines and the longest an
        // offline step may wait to be sent (72 hours) has passed.
        const expires = Math.floor(Date.parse(`${day}T23:59:59+08:00`) / 1000) + 72 * 3600;
        const token = jwt.sign(
          { purpose: "offline-voucher", date: day, ...given, key_id: keyId, offset_ms: offset, exp: expires },
          jwtSecret,
          { subject: auth.id, jwtid: jti }
        );
        // Iteration 22: a single-use passkey challenge per step for the day, signed on the
        // phone with no connection and checked when the step arrives. None without a passkey.
        const stepChallenges: Record<string, unknown> = {};
        for (const each of PASSKEY_STEPS) {
          const options = await stepOptions(client, auth.id, each, day);
          if (options) stepChallenges[each] = options;
        }
        vouchers.push({ token, date: day, ...given, ...(Object.keys(stepChallenges).length > 0 ? { step_challenges: stepChallenges } : {}) });
      }
      await client.query("COMMIT");
      return res.json({ vouchers, offset_ms: offsetMs });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      console.error("OFFLINE VOUCHERS ERROR:", error);
      return res.status(500).json({ message: "Failed to prepare this phone for offline time-in." });
    } finally {
      client?.release();
    }
  });

  /*
  |--------------------------------------------------------------------------
  | THE TIME-IN
  |--------------------------------------------------------------------------
  */

  /**
   * Checks an attested time-in, everything that can be checked without
   * spending the voucher. Returns what to store, or why it is refused.
   */
  async function checkAttested(
    req: express.Request,
    res: express.Response,
    studentId: string,
    occurredAt: Date
  ): Promise<
    | Refusal
    | {
        voucher: VoucherClaims;
        keyRowId: number;
        counter: number;
        report: Record<string, unknown>;
        attestation: Record<string, unknown>;
        skewSeconds: number;
        clockMoved: boolean;
      }
  > {
    if (!req.file) return refuse(400, "PHOTO_MISSING", "The photo for this offline time-in did not arrive. Time in again.");
    if (!["image/jpeg", "image/jpg", "image/png"].includes(req.file.mimetype)) {
      return refuse(400, "PHOTO_MISSING", "The attendance photo must be a JPG or PNG image.");
    }
    const read = readAttestation(req.body?.attestation);
    if ("problem" in read) return refuse(400, "ATTESTATION_UNREADABLE", read.problem);
    const { attestation } = read;

    // The voucher: signed here, for this student, an offline voucher.
    let voucher: VoucherClaims;
    try {
      const payload = jwt.verify(String(req.body?.voucher ?? ""), jwtSecret);
      if (typeof payload === "string" || payload.purpose !== "offline-voucher" || payload.sub !== studentId) throw new Error("not a voucher");
      voucher = payload as VoucherClaims;
    } catch {
      return refuse(400, "VOUCHER_INVALID", "This offline time-in's voucher is not valid. Time in again with a connection, or ask your supervisor.");
    }
    if (voucher.jti !== attestation.voucher_jti || voucher.key_id !== attestation.key_id) {
      return refuse(400, "VOUCHER_MISMATCH", "The signed record does not belong to this voucher.");
    }
    const stored = await pool.query<{ device_key_id: number; valid_date: string; server_offset_ms: number | null }>(
      `SELECT device_key_id, TO_CHAR(valid_date, 'YYYY-MM-DD') AS valid_date, server_offset_ms
       FROM offline_vouchers WHERE jti = $1 AND student_id = $2`,
      [voucher.jti, studentId]
    );
    if (stored.rows.length === 0) {
      return refuse(400, "VOUCHER_INVALID", "This offline time-in's voucher is no longer valid. Time in again with a connection, or ask your supervisor.");
    }
    const day = (await pool.query<{ day: string }>(`SELECT TO_CHAR(${phSql.date("$1::timestamptz")}, 'YYYY-MM-DD') AS day`, [occurredAt.toISOString()])).rows[0].day;
    if (day !== stored.rows[0].valid_date) {
      return refuse(400, "VOUCHER_WRONG_DAY", `This voucher was for ${stored.rows[0].valid_date}, not ${day}.`);
    }

    // The key the voucher was bound to, still this student's and not retired.
    const key = await pool.query<{ id: number; key_id: string; public_key_jwk: PublicJwk; counter: string }>(
      `SELECT id, key_id, public_key_jwk, counter FROM device_keys
       WHERE id = $1 AND student_id = $2 AND revoked_at IS NULL`,
      [stored.rows[0].device_key_id, studentId]
    );
    if (key.rows.length === 0 || key.rows[0].key_id !== attestation.key_id) {
      return refuse(400, "DEVICE_UNKNOWN", "This phone is not the one the voucher was given to.");
    }

    // The record is the one the phone signed, about this time-in.
    if (!signatureValid(key.rows[0].public_key_jwk, attestationMessage(attestation), req.body?.signature)) {
      return refuse(400, "SIGNATURE_INVALID", "The record signed by your phone does not match. Time in again, or ask your supervisor.");
    }
    if (Date.parse(attestation.local_time) !== Date.parse(String(req.body?.occurred_at))) {
      return refuse(400, "ATTESTATION_MISMATCH", "The time in the signed record is not the time sent.");
    }
    if (attestation.offset_at_issue_ms !== stored.rows[0].server_offset_ms) {
      return refuse(400, "ATTESTATION_MISMATCH", "The clock gap in the signed record is not the one measured when the voucher was given.");
    }
    // The photo is the one taken at the check: its bytes as they arrived.
    if (res.locals.uploadSha256 !== attestation.photo_sha256) {
      return refuse(400, "PHOTO_ALTERED", "The photo is not the one taken at the camera check, so this time-in was not added.");
    }
    if (attestation.counter <= Number(key.rows[0].counter)) {
      return refuse(409, "COUNTER_REPLAY", "This signed record was already used, so this time-in was not added.");
    }

    // The check followed the voucher's prompts.
    let report: Record<string, unknown>;
    try {
      report = JSON.parse(String(req.body?.liveness_report ?? ""));
    } catch {
      report = {};
    }
    const completed = Array.isArray(report.completed) ? report.completed.filter(isLivenessPrompt) : [];
    const flash = report.flash === "passed" || report.flash === "skipped" ? report.flash : "inconclusive";
    const required = requiredPrompts({ ...voucher }, flash);
    if (required.length < 1 || !required.every((prompt) => completed.includes(prompt as never))) {
      return refuse(400, "CHECK_INCOMPLETE", "The camera check for this time-in was not finished, so it was not added.");
    }

    // The clock gap now, against the one when the voucher was given.
    const skewSeconds = readClockSkew(req.body);
    if (skewSeconds === null) return refuse(400, "CLOCK_MISSING", "This offline time-in did not say what the phone's clock read when it was sent.");
    const clock = clockCheck(stored.rows[0].server_offset_ms ?? 0, skewSeconds);

    return {
      voucher,
      keyRowId: key.rows[0].id,
      counter: attestation.counter,
      skewSeconds,
      clockMoved: clock.clock_moved,
      report: {
        level: voucher.level === "standard" ? "standard" : "strict",
        offline: true,
        completed: [...new Set(completed)],
        flash,
        attempts: typeof report.attempts === "number" ? report.attempts : null,
        sharpness: typeof report.sharpness === "number" ? report.sharpness : null,
      },
      attestation: {
        voucher_jti: voucher.jti,
        key_id: attestation.key_id,
        counter: attestation.counter,
        photo_sha256: attestation.photo_sha256,
        local_time: attestation.local_time,
        clock_gap_at_issue_seconds: clock.at_issue_seconds,
        clock_gap_at_sync_seconds: clock.at_sync_seconds,
        clock_moved: clock.clock_moved,
      },
    };
  }

  app.post("/api/attendance/offline-time-in", requireRole("student"), photoUpload, async (req, res) => {
    let savedFile: string | undefined;
    let client: PoolClient | null = null;
    try {
      const auth = (req as Authed).auth!;
      // A time-in has its own age limit (OFFLINE_MAX_AGE_HOURS_TIME_IN, Iteration 12).
      const stamp = readOfflineStamp(req.body, "break", null, new Date(), offlineMaxAgeHoursFor("time-in"));
      if (stamp.kind === "live") {
        return res.status(400).json({
          message: "A time-in recorded offline needs the time it happened and its request id.",
        });
      }
      if (stamp.kind === "invalid") {
        return res.status(stamp.status).json({
          message:
            stamp.status === 409
              ? stamp.message.replace(/^This was recorded/, "This time-in was recorded")
              : stamp.message,
        });
      }
      // The same agreement the camera time-in asks for.
      if (consentRequired()) {
        const consent = await pool.query<{ privacy_consent_version: string | null }>(
          `SELECT privacy_consent_version FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (!hasCurrentConsent(consent.rows[0]?.privacy_consent_version)) {
          return res.status(403).json({
            code: "CONSENT_REQUIRED",
            message: "Read and agree to the privacy notice before timing in. Open the app with a connection to see it.",
          });
        }
      }
      const rawNote = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";

      const existingFor = async () =>
        pool.query<{ id: number; offline_time_in_request: string | null }>(
          `SELECT ${LOG_COLUMNS}, offline_time_in_request FROM attendance
           WHERE student_id = $1 AND date = ${phSql.date("$2::timestamptz")}
           LIMIT 1`,
          [auth.id, stamp.occurredAt.toISOString()]
        );
      const already = (rows: Array<Record<string, unknown>>) => {
        const { offline_time_in_request: request, ...log } = rows[0];
        // This very time-in, arriving again: the first answer, again.
        if (request === stamp.requestId) {
          return res.json({ message: "Time-in recorded.", attendance: log, replayed: true });
        }
        return res.status(409).json({
          code: "DAY_HAS_LOG",
          message: "A time-in for that day was already recorded, so this one was not added.",
          attendance: log,
        });
      };

      // First, whether the day has its log: a time-in sent again (its answer
      // was lost on the way) gets the first answer, before anything it
      // carries is checked or spent a second time.
      const existing = await existingFor();
      if (existing.rows.length > 0) return already(existing.rows);


      // With a photo or a voucher, it is an attested time-in and every part is checked.
      const attested = Boolean(req.file) || req.body?.voucher !== undefined;
      const checked = attested ? await checkAttested(req, res, auth.id, stamp.occurredAt) : null;
      if (checked && "code" in checked) {
        return res.status(checked.status).json({ code: checked.code, message: checked.message });
      }

      // The day's rules (services/dayRules.ts), judged at the time it really
      // happened: the phone's time less its measured clock gap. Checked after the attested
      // record is read and before anything is spent, so a refused time-in keeps its voucher.
      const rules = await loadDayRuleSettings(pool);
      const plan = await loadDayPlan(pool, auth.id, phToday(stamp.occurredAt), rules);
      const verdict = judgeTimeIn(plan, correctedTime(stamp.occurredAt, readClockSkew(req.body)), rules, stamp.occurredAt);
      if (!verdict.ok) {
        return res.status(409).json({ code: verdict.code, opensAt: verdict.opensAt, message: verdict.message, day: planForApp(plan) });
      }

      let created;
      try {
        if (!checked) {
          created = await pool.query(
            `INSERT INTO attendance
               (student_id, date, time_in, note, status, image_url, capture_method, recorded_offline, offline_time_in_request, clock_skew_seconds,
                session, credited_from, late_minutes, scheduled_start)
             VALUES
               ($1,
                ${phSql.date("$2::timestamptz")},
                ${phSql.wallTime("$2::timestamptz")},
                $3, 'Pending', NULL, NULL, TRUE, $4, $5,
                $6, ${phSql.wallTime("$7::timestamptz")}, $8, $9::time)
             RETURNING ${LOG_COLUMNS}, TO_CHAR(time_in, 'HH12:MI AM') AS at`,
            [
              auth.id, stamp.occurredAt.toISOString(), rawNote || null, stamp.requestId, readClockSkew(req.body),
              verdict.session, verdict.creditedFrom.toISOString(), verdict.lateMinutes, verdict.scheduledStart,
            ]
          );
        } else {
          // Spent together or not at all: the voucher, the counter, the log.
          client = await pool.connect();
          await client.query("BEGIN");
          const spent = await client.query(
            `UPDATE offline_vouchers SET used_at = NOW() WHERE jti = $1 AND used_at IS NULL RETURNING jti`,
            [checked.voucher.jti]
          );
          if (spent.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ code: "VOUCHER_USED", message: "This voucher was already used for a time-in, so this one was not added." });
          }
          const counted = await client.query(
            `UPDATE device_keys SET counter = $2, last_used_at = NOW() WHERE id = $1 AND counter < $2 RETURNING id`,
            [checked.keyRowId, checked.counter]
          );
          if (counted.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ code: "COUNTER_REPLAY", message: "This signed record was already used, so this time-in was not added." });
          }
          savedFile = await savePrivateFile(req.file!);
          created = await client.query(
            `INSERT INTO attendance
               (student_id, date, time_in, note, status, image_url, capture_method, liveness_checks,
                recorded_offline, offline_time_in_request, clock_skew_seconds, offline_attestation,
                session, credited_from, late_minutes, scheduled_start)
             VALUES
               ($1,
                ${phSql.date("$2::timestamptz")},
                ${phSql.wallTime("$2::timestamptz")},
                $3, 'Pending', $4, 'liveness', $5::jsonb, TRUE, $6, $7, $8::jsonb,
                $9, ${phSql.wallTime("$10::timestamptz")}, $11, $12::time)
             RETURNING ${LOG_COLUMNS}, TO_CHAR(time_in, 'HH12:MI AM') AS at`,
            [
              auth.id,
              stamp.occurredAt.toISOString(),
              rawNote || null,
              `/uploads/${savedFile}`,
              JSON.stringify(checked.report),
              stamp.requestId,
              checked.skewSeconds,
              JSON.stringify(checked.attestation),
              verdict.session,
              verdict.creditedFrom.toISOString(),
              verdict.lateMinutes,
              verdict.scheduledStart,
            ]
          );
          await client.query(`UPDATE offline_vouchers SET attendance_id = $2 WHERE jti = $1`, [checked.voucher.jti, created.rows[0].id]);
          await client.query("COMMIT");
        }
      } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => undefined);
        if (savedFile) await deletePrivateFile(savedFile).catch(() => undefined);
        savedFile = undefined;
        // Two arrivals at once: the unique index on (student, day) let one through.
        if ((error as { code?: string })?.code !== "23505") throw error;
        const raced = await existingFor();
        if (raced.rows.length > 0) return already(raced.rows);
        throw error;
      }
      const { at, ...log } = created.rows[0] as Record<string, unknown>;

      // The supervisor is told plainly what this log has and lacks. A
      // failure to tell them must not undo the log.
      try {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (owner.rows[0]?.supervisor_id) {
          await createNotification({
            supervisorId: owner.rows[0].supervisor_id,
            title: "Time-in recorded without a connection",
            message: checked
              ? `${owner.rows[0].name} recorded a time-in for ${log.date} at ${at} on a phone with no connection. The camera check ran on the phone and its photo is attached.${
                  checked.clockMoved ? " The phone's clock was changed while it was offline, so the time may be wrong." : ""
                } Confirm it by itself.`
              : `${owner.rows[0].name} recorded a time-in for ${log.date} at ${at} on a phone with no connection. There is no photo and no camera check. Confirm it only if they were at work then.`,
            type: "attendance",
            entity: { type: "attendance", id: Number(log.id) },
          });
        }
      } catch (notifyError) {
        console.error("OFFLINE TIME-IN NOTIFICATION ERROR:", notifyError);
      }

      return res.status(201).json({
        message: "Time-in recorded.",
        attendance: log,
        ...(checked ? { attested: true, clock_moved: checked.clockMoved } : {}),
      });
    } catch (error) {
      if (savedFile) await deletePrivateFile(savedFile).catch(() => undefined);
      console.error("OFFLINE TIME-IN ERROR:", error);
      return res.status(500).json({ message: "Failed to record the time-in." });
    } finally {
      client?.release();
    }
  });
}
