import type express from "express";
import type { Pool } from "pg";
import { EmailLimitError } from "../services/emailBudget";
import { isEmailConfigured, sendEmail } from "../services/mailer";
import { sameId } from "../services/ids";

/*
|--------------------------------------------------------------------------
| MESSAGES
|--------------------------------------------------------------------------
|
| A student, a supervisor or the coordinator writes to someone from the
| composer in the app (my-pwa components/ComposeMessage.tsx). Every message
| is kept in a thread between two people, raises a notification whose link
| opens the thread to reply (?thread=<id> on the recipient's home page), and
| is emailed when email is switched on: from SMTP_FROM, the programme's
| verified address, with Reply-To set to the sender so the answer can come
| from Gmail or Outlook too. An email counts against the day's allowance as
| routine mail, below password resets (services/emailBudget.ts).
|
| Who may write to whom:
|
|   student      their own supervisor; any active coordinator
|   supervisor   their own active interns; any active coordinator
|   coordinator  any active student, supervisor or other coordinator
|
| A reply goes to the other person in the thread. Ten messages a sender a
| day (MESSAGES_PER_DAY), new or replies.
|
*/

export const MESSAGES_PER_DAY = 10;
export const MESSAGE_MAX_LENGTH = 4000;
const SUBJECT_MAX_LENGTH = 150;
const CONTEXT_TYPES = ["attendance", "student", "supervisor", "appeal"] as const;

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };
type Person = { role: Role; id: string; name: string; email: string | null; active: boolean; supervisor_id?: string | null };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role[]) => express.RequestHandler;
  createNotification: (notification: {
    studentId?: string;
    supervisorId?: string;
    coordinatorId?: string;
    title: string;
    message: string;
    type: string;
    link?: string;
  }) => Promise<void>;
};

const TABLE: Record<Role, { table: string; id: string }> = {
  student: { table: "students", id: "student_id" },
  supervisor: { table: "supervisors", id: "supervisor_id" },
  coordinator: { table: "coordinators", id: "coordinator_id" },
};

/** Where a "New message" notification sends each kind of reader. */
const HOME: Record<Role, string> = {
  student: "/student/dashboard",
  supervisor: "/supervisor/dashboard",
  coordinator: "/coordinator/dashboard",
};

const ROLE_NAME: Record<Role, string> = { student: "student", supervisor: "supervisor", coordinator: "OJT coordinator" };

/** What a sender is told about delivery, by email outcome. */
export const DELIVERY: Record<string, string> = {
  sent: "Sent. A copy went to their email.",
  off: "Delivered in INTERNet. Email is not switched on.",
  no_address: "Delivered in INTERNet. They have no email address on record.",
  limit: "Delivered in INTERNet. Today's email allowance is used up, so no email was sent.",
  failed: "Delivered in INTERNet. The email could not be sent.",
};

const isRole = (value: unknown): value is Role => value === "student" || value === "supervisor" || value === "coordinator";

export function registerMessageRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, createNotification } = deps;

  async function person(role: Role, id: string): Promise<Person | null> {
    const { table, id: column } = TABLE[role];
    const extra = role === "student" ? ", supervisor_id" : "";
    const result = await pool.query(
      `SELECT ${column} AS id, name, email, COALESCE(is_active, TRUE) AS active${extra} FROM ${table} WHERE ${column} = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? { role, id: String(row.id), name: row.name, email: row.email, active: row.active, supervisor_id: row.supervisor_id ?? null } : null;
  }

  /** Why `from` may not write to `to`, or null when they may. */
  function refusal(from: Person, to: Person): string | null {
    if (from.role === to.role && sameId(from.id, to.id)) return "You cannot write to yourself.";
    if (!to.active) return "That account is not active.";
    if (from.role === "coordinator") return null;
    if (to.role === "coordinator") return null;
    if (from.role === "student" && to.role === "supervisor" && sameId(from.supervisor_id, to.id)) return null;
    if (from.role === "supervisor" && to.role === "student" && sameId(to.supervisor_id, from.id)) return null;
    return "You can write to your own supervisor or interns, and to the OJT coordinator.";
  }

  /** Stores one message, notifies and emails the recipient, and says how it went. */
  async function deliver(
    threadId: number,
    subject: string,
    contextLabel: string | null,
    from: Person,
    to: Person,
    body: string
  ): Promise<{ id: number; email_status: string; delivery: string }> {
    const stored = await pool.query<{ id: number }>(
      `INSERT INTO messages (thread_id, sender_role, sender_id, sender_name, recipient_role, recipient_id, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [threadId, from.role, from.id, from.name, to.role, to.id, body]
    );
    await pool.query(`UPDATE message_threads SET last_message_at = NOW() WHERE id = $1`, [threadId]);
    const messageId = stored.rows[0].id;

    const link = `${HOME[to.role]}?thread=${threadId}`;
    try {
      await createNotification({
        ...(to.role === "student" ? { studentId: to.id } : to.role === "supervisor" ? { supervisorId: to.id } : { coordinatorId: to.id }),
        title: "New message",
        message: `${from.name} (${ROLE_NAME[from.role]}) wrote to you: "${subject}". Open it to read and reply.`,
        type: "message",
        link,
      });
    } catch (error) {
      console.error("MESSAGE NOTIFICATION ERROR:", error);
    }

    let status = "off";
    if (isEmailConfigured()) {
      if (!to.email) {
        status = "no_address";
      } else {
        const site = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
        try {
          await sendEmail({
            to: to.email,
            subject: `[INTERNet] ${subject}`,
            text: [
              `${from.name} (${ROLE_NAME[from.role]}) wrote to you in INTERNet:`,
              "",
              body,
              "",
              ...(contextLabel ? [`About: ${contextLabel}`, ""] : []),
              site ? `Reply in INTERNet: ${site}${link}` : "Reply in INTERNet.",
              from.email ? `Or reply to this email: it goes to ${from.email}.` : "",
            ].join("\n"),
            replyTo: from.email ?? undefined,
            // Below password resets: when the day's allowance runs low, resets still go out.
            kind: "routine",
          });
          status = "sent";
        } catch (error) {
          status = error instanceof EmailLimitError ? "limit" : "failed";
          if (status === "failed") console.error("MESSAGE EMAIL ERROR:", error instanceof Error ? error.message : error);
        }
      }
    }
    await pool.query(`UPDATE messages SET email_status = $2 WHERE id = $1`, [messageId, status]);
    return { id: messageId, email_status: status, delivery: DELIVERY[status] };
  }

  /** Refuses when the sender has used the day's messages. */
  async function overLimit(sender: { role: Role; id: string }): Promise<boolean> {
    const sent = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM messages WHERE sender_role = $1 AND sender_id = $2 AND created_at >= CURRENT_DATE`,
      [sender.role, sender.id]
    );
    return sent.rows[0].n >= MESSAGES_PER_DAY;
  }

  const readBody = (raw: unknown): { body: string } | { problem: string } => {
    const body = typeof raw === "string" ? raw.trim() : "";
    if (body.length < 2) return { problem: "Write your message." };
    if (body.length > MESSAGE_MAX_LENGTH) return { problem: `A message is at most ${MESSAGE_MAX_LENGTH} characters.` };
    return { body };
  };

  /** The To line of the composer: who someone is, if the signed-in person may write to them. */
  app.get("/api/messages/recipient/:role/:id", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!isRole(req.params.role)) return res.status(404).json({ message: "That person was not found." });
      const [from, to] = await Promise.all([person(auth.role, auth.id), person(req.params.role, String(req.params.id))]);
      if (!from) return res.status(401).json({ message: "Sign in again." });
      if (!to) return res.status(404).json({ message: "That person was not found." });
      const refused = refusal(from, to);
      if (refused) return res.status(403).json({ message: refused });
      return res.json({ recipient: { role: to.role, id: to.id, name: to.name, email: to.email } });
    } catch (error) {
      console.error("MESSAGE RECIPIENT ERROR:", error);
      return res.status(500).json({ message: "Failed to look up who the message is for." });
    }
  });

  app.post("/api/messages", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!isRole(req.body?.to_role) || typeof req.body?.to_id !== "string" || !req.body.to_id.trim()) {
        return res.status(400).json({ message: "Choose who the message is for." });
      }
      const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
      if (subject.length < 2 || subject.length > SUBJECT_MAX_LENGTH) {
        return res.status(400).json({ message: `Give the message a subject (up to ${SUBJECT_MAX_LENGTH} characters).` });
      }
      const read = readBody(req.body?.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const contextType = req.body?.context_type ?? null;
      const contextId = req.body?.context_id ?? null;
      const contextLabel = typeof req.body?.context_label === "string" ? req.body.context_label.trim().slice(0, 120) : null;
      if (contextType !== null && (!CONTEXT_TYPES.includes(contextType) || typeof contextId !== "string" || !/^[\w-]{1,80}$/.test(contextId))) {
        return res.status(400).json({ message: "What the message is about could not be read." });
      }

      const [from, to] = await Promise.all([person(auth.role, auth.id), person(req.body.to_role, req.body.to_id.trim())]);
      if (!from) return res.status(401).json({ message: "Sign in again." });
      if (!to) return res.status(404).json({ message: "That person was not found." });
      const refused = refusal(from, to);
      if (refused) return res.status(403).json({ message: refused });
      if (await overLimit(from)) {
        return res.status(429).json({ code: "MESSAGE_LIMIT", message: `You have sent ${MESSAGES_PER_DAY} messages today, the most for one day. Try again tomorrow.` });
      }

      const thread = await pool.query<{ id: number }>(
        `INSERT INTO message_threads (subject, context_type, context_id, context_label, party_a_role, party_a_id, party_b_role, party_b_id, created_by_role, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5, $6) RETURNING id`,
        [subject, contextType, contextId, contextType ? contextLabel : null, from.role, from.id, to.role, to.id]
      );
      const sent = await deliver(thread.rows[0].id, subject, contextLabel, from, to, read.body);
      return res.status(201).json({ message: sent.delivery, thread_id: thread.rows[0].id, email_status: sent.email_status });
    } catch (error) {
      console.error("SEND MESSAGE ERROR:", error);
      return res.status(500).json({ message: "Failed to send the message." });
    }
  });

  /** The thread if the signed-in person is in it, with the other person. */
  async function threadFor(id: string, me: { role: Role; id: string }) {
    if (!/^\d{1,9}$/.test(id)) return null;
    const result = await pool.query(
      `SELECT id, subject, context_type, context_id, context_label, party_a_role, party_a_id, party_b_role, party_b_id
       FROM message_threads WHERE id = $1`,
      [id]
    );
    const thread = result.rows[0];
    if (!thread) return null;
    const isA = thread.party_a_role === me.role && sameId(thread.party_a_id, me.id);
    const isB = thread.party_b_role === me.role && sameId(thread.party_b_id, me.id);
    if (!isA && !isB) return null;
    const other = isA ? { role: thread.party_b_role as Role, id: thread.party_b_id } : { role: thread.party_a_role as Role, id: thread.party_a_id };
    return { thread, other };
  }

  app.get("/api/messages/threads/:id", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const found = await threadFor(String(req.params.id), auth);
      if (!found) return res.status(404).json({ message: "Message not found." });
      const other = await person(found.other.role, found.other.id);
      const messages = await pool.query(
        `SELECT id, sender_role, sender_id, sender_name, body, created_at, email_status, read_at
         FROM messages WHERE thread_id = $1 ORDER BY created_at, id`,
        [found.thread.id]
      );
      // Opening it reads what was sent to this person.
      await pool.query(
        `UPDATE messages SET read_at = NOW() WHERE thread_id = $1 AND recipient_role = $2 AND recipient_id = $3 AND read_at IS NULL`,
        [found.thread.id, auth.role, auth.id]
      );
      return res.json({
        thread: {
          id: found.thread.id,
          subject: found.thread.subject,
          context_type: found.thread.context_type,
          context_id: found.thread.context_id,
          context_label: found.thread.context_label,
        },
        with: other
          ? { role: other.role, id: other.id, name: other.name, email: other.email }
          : { role: found.other.role, id: found.other.id, name: "Account removed", email: null },
        messages: messages.rows.map((row) => {
          const mine = row.sender_role === auth.role && sameId(row.sender_id, auth.id);
          return {
            id: row.id,
            mine,
            sender_name: row.sender_name,
            body: row.body,
            created_at: row.created_at,
            // How a message of one's own was delivered; not shown for the other person's.
            ...(mine ? { delivery: DELIVERY[row.email_status] } : {}),
          };
        }),
      });
    } catch (error) {
      console.error("READ THREAD ERROR:", error);
      return res.status(500).json({ message: "Failed to load the message." });
    }
  });

  app.post("/api/messages/threads/:id", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const found = await threadFor(String(req.params.id), auth);
      if (!found) return res.status(404).json({ message: "Message not found." });
      const read = readBody(req.body?.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const [from, to] = await Promise.all([person(auth.role, auth.id), person(found.other.role, found.other.id)]);
      if (!from) return res.status(401).json({ message: "Sign in again." });
      if (!to || !to.active) return res.status(409).json({ message: "That account is no longer active, so the reply was not sent." });
      // The same rule as a new message: an intern moved to another supervisor is no longer written to by the old one.
      const refused = refusal(from, to);
      if (refused) return res.status(403).json({ message: refused });
      if (await overLimit(from)) {
        return res.status(429).json({ code: "MESSAGE_LIMIT", message: `You have sent ${MESSAGES_PER_DAY} messages today, the most for one day. Try again tomorrow.` });
      }
      const sent = await deliver(found.thread.id, `Re: ${found.thread.subject}`.slice(0, SUBJECT_MAX_LENGTH + 4), found.thread.context_label, from, to, read.body);
      return res.status(201).json({ message: sent.delivery, thread_id: found.thread.id, email_status: sent.email_status });
    } catch (error) {
      console.error("REPLY MESSAGE ERROR:", error);
      return res.status(500).json({ message: "Failed to send the reply." });
    }
  });
}
