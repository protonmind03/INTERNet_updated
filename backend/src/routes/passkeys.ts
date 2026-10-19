import type express from "express";
import type { Pool } from "pg";
import { finishRegistration, PASSKEY_STEPS, registrationOptions, stepOptions, type PasskeyStep } from "../services/passkeys";

/*
|--------------------------------------------------------------------------
| PASSKEYS (Iteration 22, migration 069)
|--------------------------------------------------------------------------
|
| The trainee's own passkeys, from Profile › Security and device:
|
|   POST   /api/passkeys/register/options   options for this device (5 minutes)
|   POST   /api/passkeys/register           the device's answer; the passkey is kept
|   GET    /api/passkeys                    the passkeys: label, made, last used
|   DELETE /api/passkeys/:id                removed (revoked), never deleted
|   POST   /api/passkeys/step-challenge     a challenge to confirm one step, or
|                                           null when the trainee has no passkey
|
| The steps themselves (Lunch break, End break, Time out) verify the answer
| and record how they were made (services/passkeys.ts); they never refuse
| for it.
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };

type Dependencies = { pool: Pool; requireRole: (role: string) => express.RequestHandler };

export function registerPasskeyRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole } = deps;

  app.post("/api/passkeys/register/options", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const found = await pool.query<{ student_id: string; email: string; name: string }>(
        `SELECT student_id, email, name FROM students WHERE student_id = $1`,
        [auth.id]
      );
      if (!found.rows[0]) return res.status(404).json({ message: "Student not found." });
      return res.json({ options: await registrationOptions(pool, found.rows[0]) });
    } catch (error) {
      console.error("PASSKEY OPTIONS ERROR:", error);
      return res.status(500).json({ message: "Could not start adding a passkey." });
    }
  });

  app.post("/api/passkeys/register", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const response = req.body?.response;
      if (!response || typeof response !== "object") return res.status(400).json({ message: "Send the passkey's answer." });
      const label = typeof req.body?.label === "string" && req.body.label.trim() ? req.body.label.trim() : null;
      const saved = await finishRegistration(pool, auth.id, response, label);
      if (!saved.ok) return res.status(400).json({ message: saved.problem });
      return res.status(201).json({ message: "Passkey added.", id: saved.id });
    } catch (error) {
      console.error("PASSKEY REGISTER ERROR:", error);
      return res.status(500).json({ message: "Could not add the passkey." });
    }
  });

  app.get("/api/passkeys", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const rows = await pool.query(
        `SELECT id, device_label, backed_up, created_at, last_used_at FROM webauthn_credentials
         WHERE student_id = $1 AND revoked_at IS NULL ORDER BY created_at, id`,
        [auth.id]
      );
      return res.json({ passkeys: rows.rows });
    } catch (error) {
      console.error("PASSKEY LIST ERROR:", error);
      return res.status(500).json({ message: "Could not load your passkeys." });
    }
  });

  app.delete("/api/passkeys/:id", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Passkey not found." });
      const removed = await pool.query(
        `UPDATE webauthn_credentials SET revoked_at = NOW() WHERE id = $1 AND student_id = $2 AND revoked_at IS NULL RETURNING id`,
        [req.params.id, auth.id]
      );
      if (removed.rows.length === 0) return res.status(404).json({ message: "Passkey not found." });
      return res.json({ message: "Passkey removed." });
    } catch (error) {
      console.error("PASSKEY REMOVE ERROR:", error);
      return res.status(500).json({ message: "Could not remove the passkey." });
    }
  });

  app.post("/api/passkeys/step-challenge", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const step = String(req.body?.step || "") as PasskeyStep;
      if (!PASSKEY_STEPS.includes(step)) return res.status(400).json({ message: "Name the step: break, break-end or time-out." });
      return res.json({ options: await stepOptions(pool, auth.id, step) });
    } catch (error) {
      console.error("PASSKEY STEP CHALLENGE ERROR:", error);
      return res.status(500).json({ message: "Could not start the passkey check." });
    }
  });
}
