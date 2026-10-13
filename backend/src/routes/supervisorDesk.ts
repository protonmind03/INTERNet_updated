import type express from "express";
import type { Pool } from "pg";
import { manilaClock } from "../services/digests";
import { SLOW_REVIEW_DAYS } from "../services/insights";
import { readReleaseDay, scheduledLater } from "../services/taskRelease";

/*
|--------------------------------------------------------------------------
| THE SUPERVISOR'S DESK
|--------------------------------------------------------------------------
|
| What Round 2's Phase 4 added around a supervisor's day:
|
|   schedules     every one of their interns' weekly schedules in one answer
|   teams         named groups of their interns, and tasks given to a group
|   notes         a thread about one student between the supervisor and the
|                 coordinators, which the student never sees
|   reminders     a coordinator nudging a supervisor who has reviews waiting
|   site visit    the latest visit to the supervisor's company, in part
|   announcement  the newest one the supervisor has not seen yet
|
| A TEAM TASK IS ONE ROW PER MEMBER. Assigning to a team writes an ordinary
| task for each member, all carrying the same group_task_id. Each member
| submits their own and is reviewed on their own; what the team shares is
| the assignment. Editing or cancelling the team task changes the rows not
| yet submitted and says how many it had to leave.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  createNotification: (notification: {
    studentId?: string | null;
    supervisorId?: string | null;
    title: string;
    message: string;
    type?: string;
    link?: string;
    entity?: { type: string; id: string | number | null | undefined };
  }) => Promise<void>;
  notifyCoordinators: (notification: {
    title: string;
    message: string;
    type?: string;
    link?: string;
    entity?: { type: string; id: string | number | null | undefined };
  }) => Promise<void>;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const wholeId = (value: unknown): number | null => (/^[0-9]{1,9}$/.test(String(value)) ? Number(value) : null);
const isUnique = (error: unknown) => (error as { code?: string }).code === "23505";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The most interns one team can hold. */
const MAX_TEAM = 50;
const NOTE_MAX = 2000;

export function registerSupervisorDeskRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator, createNotification, notifyCoordinators } = deps;
  const quietly = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      console.error(`${label}:`, error);
    }
  };

  /*
  | Schedules: all of a supervisor's interns at once
  */

  app.get("/api/supervisor/schedules", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const result = await pool.query(
        `SELECT o.student_id, INITCAP(TRIM(o.day)) AS day, o.start_time, o.end_time,
                COALESCE(o.hours, 0)::float AS hours, o.focus
         FROM ojt_schedule o
         JOIN students s ON s.student_id = o.student_id
         WHERE TRIM(s.supervisor_id::text) = TRIM($1::text) AND s.is_active = TRUE AND o.is_active = TRUE
         ORDER BY o.student_id, o.start_time`,
        [auth.id]
      );
      return res.json({ schedules: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR SCHEDULES ERROR:", error);
      return res.status(500).json({ message: "Failed to load your interns' schedules." });
    }
  });

  /*
  | The latest site visit to the supervisor's company: its date and the
  | follow-up items. What the coordinator found is the coordinator's own
  | record and is not sent.
  */

  app.get("/api/supervisor/site-visit", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const result = await pool.query(
        `SELECT TO_CHAR(v.visit_date, 'YYYY-MM-DD') AS visit_date, v.follow_up, c.name AS company
         FROM supervisors sup
         JOIN companies c ON c.id = sup.company_id
         JOIN site_visits v ON v.company_id = c.id
         WHERE sup.supervisor_id = $1
         ORDER BY v.visit_date DESC, v.id DESC
         LIMIT 1`,
        [auth.id]
      );
      return res.json({ visit: result.rows[0] ?? null });
    } catch (error) {
      console.error("GET SUPERVISOR SITE VISIT ERROR:", error);
      return res.status(500).json({ message: "Failed to load the site visit." });
    }
  });

  /*
  | The newest announcement the supervisor has not had on a list yet.
  | Asking for it does not count as having seen it: only opening the list
  | of announcements does (GET /api/announcements).
  */

  app.get("/api/supervisor/announcement-unread", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const result = await pool.query(
        `SELECT a.id, a.title, a.created_at, COUNT(*) OVER ()::int AS unread
         FROM announcements a
         WHERE a.audience IN ('supervisors', 'everyone')
           AND (
             a.company IS NULL OR TRIM(a.company) = ''
             OR LOWER(TRIM(a.company)) = LOWER(TRIM(COALESCE((
               SELECT company FROM supervisors WHERE supervisor_id = $1
             ), '')))
           )
           AND NOT EXISTS (
             SELECT 1 FROM announcement_reads r
             WHERE r.announcement_id = a.id AND r.role = 'supervisor' AND r.account_id = $1
           )
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 1`,
        [auth.id]
      );
      const row = result.rows[0];
      return res.json({
        announcement: row ? { id: row.id, title: row.title, created_at: row.created_at } : null,
        unread: row ? row.unread : 0,
      });
    } catch (error) {
      console.error("GET UNREAD ANNOUNCEMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to load announcements." });
    }
  });

  /*
  | Teams
  */

  /** The ids given, if every one is an active intern of this supervisor. */
  async function ownInterns(value: unknown, supervisorId: string): Promise<{ ids: string[] } | { problem: string }> {
    if (!Array.isArray(value) || value.length === 0) return { problem: "Choose at least one intern for the team." };
    if (value.length > MAX_TEAM) return { problem: `A team can have at most ${MAX_TEAM} interns.` };
    if (value.some((item) => typeof item !== "string" || !item.trim() || item.length > 50)) {
      return { problem: "That list of interns is not readable." };
    }
    const ids = [...new Set((value as string[]).map((item) => item.trim()))];
    const mine = await pool.query<{ student_id: string }>(
      `SELECT student_id FROM students
       WHERE student_id = ANY($1::text[]) AND TRIM(supervisor_id::text) = TRIM($2::text) AND is_active = TRUE`,
      [ids, supervisorId]
    );
    if (mine.rows.length !== ids.length) return { problem: "A team can only have your own active interns." };
    return { ids };
  }

  const teamRows = (supervisorId: string, teamId?: number) =>
    pool.query(
      `SELECT g.id, g.name,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT('student_id', s.student_id, 'name', s.name, 'is_active', s.is_active) ORDER BY s.name)
                FROM task_group_members m JOIN students s ON s.student_id = m.student_id
                WHERE m.group_id = g.id
              ), '[]'::json) AS members
       FROM task_groups g
       WHERE g.supervisor_id = $1 AND ($2::int IS NULL OR g.id = $2)
       ORDER BY LOWER(g.name)`,
      [supervisorId, teamId ?? null]
    );

  app.get("/api/supervisor/teams", requireRole("supervisor"), async (req, res) => {
    try {
      return res.json({ teams: (await teamRows((req as Authed).auth!.id)).rows });
    } catch (error) {
      console.error("GET TEAMS ERROR:", error);
      return res.status(500).json({ message: "Failed to load your teams." });
    }
  });

  app.post("/api/supervisor/teams", requireRole("supervisor"), async (req, res) => {
    const auth = (req as Authed).auth!;
    const name = text(req.body?.name);
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ message: "A team's name must be 2 to 80 characters." });
    }
    const client = await pool.connect();
    try {
      const members = await ownInterns(req.body?.student_ids, auth.id);
      if ("problem" in members) return res.status(400).json({ message: members.problem });
      await client.query("BEGIN");
      const saved = await client.query<{ id: number }>(
        `INSERT INTO task_groups (supervisor_id, name) VALUES ($1, $2) RETURNING id`,
        [auth.id, name]
      );
      await client.query(
        `INSERT INTO task_group_members (group_id, student_id) SELECT $1, UNNEST($2::text[])`,
        [saved.rows[0].id, members.ids]
      );
      await client.query("COMMIT");
      const team = (await teamRows(auth.id, saved.rows[0].id)).rows[0];
      return res.status(201).json({ message: `Team "${name}" created.`, team });
    } catch (error) {
      await quietly("TEAM ROLLBACK ERROR", () => client.query("ROLLBACK"));
      if (isUnique(error)) return res.status(409).json({ message: "You already have a team with that name." });
      console.error("ADD TEAM ERROR:", error);
      return res.status(500).json({ message: "Failed to create the team." });
    } finally {
      client.release();
    }
  });

  app.put("/api/supervisor/teams/:id", requireRole("supervisor"), async (req, res) => {
    const auth = (req as Authed).auth!;
    const teamId = wholeId(req.params.id);
    if (teamId === null) return res.status(404).json({ message: "Team not found." });
    const renaming = req.body?.name !== undefined;
    const name = text(req.body?.name);
    if (renaming && (name.length < 2 || name.length > 80)) {
      return res.status(400).json({ message: "A team's name must be 2 to 80 characters." });
    }
    const client = await pool.connect();
    try {
      const members = req.body?.student_ids === undefined ? null : await ownInterns(req.body.student_ids, auth.id);
      if (members && "problem" in members) return res.status(400).json({ message: members.problem });
      await client.query("BEGIN");
      const owned = await client.query(
        `UPDATE task_groups SET name = CASE WHEN $3::boolean THEN $4 ELSE name END, updated_at = NOW()
         WHERE id = $1 AND supervisor_id = $2 RETURNING id`,
        [teamId, auth.id, renaming, name]
      );
      if (owned.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Team not found." });
      }
      if (members) {
        // Tasks already given to the team stay with whoever had them.
        await client.query(`DELETE FROM task_group_members WHERE group_id = $1`, [teamId]);
        await client.query(
          `INSERT INTO task_group_members (group_id, student_id) SELECT $1, UNNEST($2::text[])`,
          [teamId, members.ids]
        );
      }
      await client.query("COMMIT");
      const team = (await teamRows(auth.id, teamId)).rows[0];
      return res.json({ message: "Team saved.", team });
    } catch (error) {
      await quietly("TEAM ROLLBACK ERROR", () => client.query("ROLLBACK"));
      if (isUnique(error)) return res.status(409).json({ message: "You already have a team with that name." });
      console.error("EDIT TEAM ERROR:", error);
      return res.status(500).json({ message: "Failed to save the team." });
    } finally {
      client.release();
    }
  });

  // Removing a team removes the grouping only. Tasks it was given stay.
  app.delete("/api/supervisor/teams/:id", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const teamId = wholeId(req.params.id);
      if (teamId === null) return res.status(404).json({ message: "Team not found." });
      const gone = await pool.query<{ name: string }>(
        `DELETE FROM task_groups WHERE id = $1 AND supervisor_id = $2 RETURNING name`,
        [teamId, auth.id]
      );
      if (gone.rows.length === 0) return res.status(404).json({ message: "Team not found." });
      return res.json({ message: `Team "${gone.rows[0].name}" removed. Tasks it was given are kept.`, name: gone.rows[0].name });
    } catch (error) {
      console.error("REMOVE TEAM ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the team." });
    }
  });

  /*
  | Team tasks
  */

  type TaskFields = { title: string; description: string | null; priority: string; dueDate: string; releaseDay: string | null };

  function readTask(body: unknown): { problem: string } | TaskFields {
    const input = (body ?? {}) as Record<string, unknown>;
    const title = text(input.title);
    const description = text(input.description);
    const priority = input.priority === undefined || input.priority === "" ? "Medium" : input.priority;
    const dueDate = text(input.due_date);
    const { date: today } = manilaClock(new Date());
    if (!title || title.length > 200) return { problem: "A task title is required, 200 characters or fewer." };
    if (description.length > 5000) return { problem: "Keep the description to 5000 characters." };
    if (typeof priority !== "string" || !["High", "Medium", "Low"].includes(priority)) {
      return { problem: "Priority must be High, Medium, or Low." };
    }
    if (!DATE.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
      return { problem: "Due date must be a valid date (YYYY-MM-DD)." };
    }
    if (dueDate < today) return { problem: "The due date cannot be in the past." };
    const release = readReleaseDay(input.available_from, today, dueDate);
    if ("problem" in release) return release;
    return { title, description: description || null, priority, dueDate, releaseDay: release.day };
  }

  app.post("/api/tasks/team", requireRole("supervisor"), async (req, res) => {
    const auth = (req as Authed).auth!;
    const teamId = wholeId(req.body?.group_id);
    if (teamId === null) return res.status(400).json({ message: "Choose the team to give the task to." });
    const fields = readTask(req.body);
    if ("problem" in fields) return res.status(400).json({ message: fields.problem });
    const client = await pool.connect();
    try {
      const team = await pool.query<{ name: string }>(
        `SELECT name FROM task_groups WHERE id = $1 AND supervisor_id = $2`,
        [teamId, auth.id]
      );
      if (team.rows.length === 0) return res.status(404).json({ message: "Team not found." });
      // Only members who are still this supervisor's active interns.
      const members = await pool.query<{ student_id: string; name: string }>(
        `SELECT s.student_id, s.name FROM task_group_members m
         JOIN students s ON s.student_id = m.student_id
         WHERE m.group_id = $1 AND TRIM(s.supervisor_id::text) = TRIM($2::text) AND s.is_active = TRUE
         ORDER BY s.name`,
        [teamId, auth.id]
      );
      if (members.rows.length === 0) {
        return res.status(409).json({ message: "That team has no active interns of yours to give the task to." });
      }
      const supervisor = await pool.query<{ name: string }>(`SELECT name FROM supervisors WHERE supervisor_id = $1`, [auth.id]);

      await client.query("BEGIN");
      const groupTaskId = Number((await client.query(`SELECT NEXTVAL('tasks_group_task_id_seq') AS id`)).rows[0].id);
      const created = await client.query<{ id: number; student_id: string }>(
        `INSERT INTO tasks
           (student_id, title, description, assigned_by, assigned_by_id, priority, status, due_date, created_at,
            available_from, released_notified_at, group_task_id, task_group_id)
         SELECT member, $2, $3, $4, $5, $6, 'Pending', $7::date, NOW(),
                $8::date, NULL, $9, $10
         FROM UNNEST($1::text[]) AS member
         RETURNING id, student_id`,
        [members.rows.map((row) => row.student_id), fields.title, fields.description, supervisor.rows[0]?.name ?? null,
          auth.id, fields.priority, fields.dueDate, fields.releaseDay, groupTaskId, teamId]
      );
      await client.query("COMMIT");

      // Told now, unless the task is for a later day: the release loop tells them then.
      if (!fields.releaseDay) {
        for (const row of created.rows) {
          await quietly("TEAM TASK NOTIFICATION ERROR", () =>
            createNotification({
              studentId: String(row.student_id),
              title: "New task assigned",
              message: `"${fields.title}" was assigned to you and the rest of ${team.rows[0].name}, due ${fields.dueDate}. Each of you submits your own work.`,
              type: "info",
              entity: { type: "task", id: row.id },
            })
          );
        }
      }
      return res.status(201).json({
        message: fields.releaseDay
          ? `Task scheduled for ${count(created.rows.length, "member", "members")} of ${team.rows[0].name}. They will see it on ${fields.releaseDay}.`
          : `Task assigned to ${count(created.rows.length, "member", "members")} of ${team.rows[0].name}.`,
        group_task_id: groupTaskId,
        created: created.rows.length,
        team: team.rows[0].name,
      });
    } catch (error) {
      await quietly("TEAM TASK ROLLBACK ERROR", () => client.query("ROLLBACK"));
      console.error("ASSIGN TEAM TASK ERROR:", error);
      return res.status(500).json({ message: "Failed to assign the team task. Nothing was created." });
    } finally {
      client.release();
    }
  });

  // Changes the team task for every member who has not submitted yet.
  app.put("/api/tasks/team/:groupTaskId", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const groupTaskId = wholeId(req.params.groupTaskId);
      if (groupTaskId === null) return res.status(404).json({ message: "Team task not found." });
      const fields = readTask(req.body);
      if ("problem" in fields) return res.status(400).json({ message: fields.problem });
      const rows = await pool.query<{ open: number; total: number; waits_until: string | null }>(
        `SELECT COUNT(*) FILTER (WHERE t.status IN ('Pending', 'In Progress'))::int AS open, COUNT(*)::int AS total,
                TO_CHAR(MAX(t.available_from) FILTER (WHERE t.status IN ('Pending', 'In Progress') AND ${scheduledLater("t.")}), 'YYYY-MM-DD') AS waits_until
         FROM tasks t JOIN students s ON s.student_id = t.student_id
         WHERE t.group_task_id = $1 AND TRIM(s.supervisor_id::text) = TRIM($2::text)`,
        [groupTaskId, auth.id]
      );
      if (rows.rows[0].total === 0) return res.status(404).json({ message: "Team task not found." });
      // A form that does not send the release day leaves it, and the due date cannot come before it.
      const moving = req.body?.available_from !== undefined;
      if (!moving && rows.rows[0].waits_until && fields.dueDate < rows.rows[0].waits_until) {
        return res.status(400).json({ message: "The due date must be on or after the release date." });
      }
      // The release day can only be moved while nobody has been shown the
      // task. Sent empty or as today, it is out today, and the release loop
      // tells each member.
      const changed = await pool.query(
        `UPDATE tasks t
         SET title = $3, description = $4, priority = $5, due_date = $6::date,
             available_from = CASE WHEN $8::boolean AND t.released_notified_at IS NULL AND ${scheduledLater("t.")}
               THEN COALESCE($7::date, CURRENT_DATE) ELSE t.available_from END
         FROM students s
         WHERE t.group_task_id = $1 AND s.student_id = t.student_id
           AND TRIM(s.supervisor_id::text) = TRIM($2::text)
           AND t.status IN ('Pending', 'In Progress')
         RETURNING t.id`,
        [groupTaskId, auth.id, fields.title, fields.description, fields.priority, fields.dueDate, fields.releaseDay, moving]
      );
      const updated = changed.rowCount ?? 0;
      const skipped = rows.rows[0].total - updated;
      return res.json({
        message:
          `Task changed for ${count(updated, "member", "members")}.` +
          (skipped > 0 ? ` ${count(skipped, "member has", "members have")} already submitted, so theirs was left as it is.` : ""),
        updated,
        skipped,
      });
    } catch (error) {
      console.error("EDIT TEAM TASK ERROR:", error);
      return res.status(500).json({ message: "Failed to change the team task." });
    }
  });

  // Cancels the team task for every member who has not submitted yet.
  app.delete("/api/tasks/team/:groupTaskId", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const groupTaskId = wholeId(req.params.groupTaskId);
      if (groupTaskId === null) return res.status(404).json({ message: "Team task not found." });
      const total = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM tasks t JOIN students s ON s.student_id = t.student_id
         WHERE t.group_task_id = $1 AND TRIM(s.supervisor_id::text) = TRIM($2::text)`,
        [groupTaskId, auth.id]
      );
      if (total.rows[0].total === 0) return res.status(404).json({ message: "Team task not found." });
      const gone = await pool.query<{ student_id: string; title: string; told: boolean }>(
        `DELETE FROM tasks t
         USING students s
         WHERE t.group_task_id = $1 AND s.student_id = t.student_id
           AND TRIM(s.supervisor_id::text) = TRIM($2::text)
           AND t.status IN ('Pending', 'In Progress')
         RETURNING t.student_id, t.title, NOT ${scheduledLater("t.")} AS told`,
        [groupTaskId, auth.id]
      );
      // Only those who had been shown the task are told it is gone.
      for (const row of gone.rows.filter((item) => item.told)) {
        await quietly("TEAM TASK CANCEL NOTIFICATION ERROR", () =>
          createNotification({
            studentId: String(row.student_id),
            title: "Task cancelled",
            message: `"${row.title}" was cancelled by your supervisor.`,
            type: "info",
          })
        );
      }
      const cancelled = gone.rowCount ?? 0;
      const skipped = total.rows[0].total - cancelled;
      return res.json({
        message:
          `Task cancelled for ${count(cancelled, "member", "members")}.` +
          (skipped > 0 ? ` ${count(skipped, "member has", "members have")} already submitted, so theirs was kept.` : ""),
        title: gone.rows[0]?.title ?? null,
        cancelled,
        skipped,
      });
    } catch (error) {
      console.error("CANCEL TEAM TASK ERROR:", error);
      return res.status(500).json({ message: "Failed to cancel the team task." });
    }
  });

  /*
  | Notes about a student, between their supervisor and the coordinators
  */

  /** The student, if the caller may read their notes: their supervisor, or a coordinator. */
  async function notedStudent(auth: { role: Role; id: string }, studentId: string) {
    const found = await pool.query<{ student_id: string; name: string; supervisor_id: string | null }>(
      `SELECT student_id, name, supervisor_id FROM students
       WHERE student_id = $1 AND ($2 = 'coordinator' OR TRIM(supervisor_id::text) = TRIM($3::text))`,
      [studentId, auth.role, auth.id]
    );
    return found.rows[0] ?? null;
  }

  app.get("/api/student-notes/:studentId", requireRole(["supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const student = await notedStudent(auth, String(req.params.studentId));
      if (!student) return res.status(404).json({ message: "Student not found." });
      const notes = await pool.query(
        `SELECT id, author_role, author_name, message, created_at,
                (author_role = $2 AND author_id = $3) AS mine
         FROM student_notes WHERE student_id = $1 ORDER BY created_at, id`,
        [student.student_id, auth.role, auth.id]
      );
      return res.json({ notes: notes.rows });
    } catch (error) {
      console.error("GET STUDENT NOTES ERROR:", error);
      return res.status(500).json({ message: "Failed to load the notes." });
    }
  });

  app.post("/api/student-notes/:studentId", requireRole(["supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const message = text(req.body?.message);
      if (!message) return res.status(400).json({ message: "Write the note first." });
      if (message.length > NOTE_MAX) return res.status(400).json({ message: `Keep the note to ${NOTE_MAX} characters.` });
      const student = await notedStudent(auth, String(req.params.studentId));
      if (!student) return res.status(404).json({ message: "Student not found." });
      const author = await pool.query<{ name: string }>(
        auth.role === "coordinator"
          ? `SELECT name FROM coordinators WHERE coordinator_id = $1`
          : `SELECT name FROM supervisors WHERE supervisor_id = $1`,
        [auth.id]
      );
      const authorName = author.rows[0]?.name || (auth.role === "coordinator" ? "OJT coordinator" : "Supervisor");
      const saved = await pool.query(
        `INSERT INTO student_notes (student_id, author_role, author_id, author_name, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, author_role, author_name, message, created_at, TRUE AS mine`,
        [student.student_id, auth.role, auth.id, authorName, message]
      );

      // The other side is told. Never the student.
      const preview = message.length > 140 ? `${message.slice(0, 137)}...` : message;
      const id = encodeURIComponent(student.student_id);
      await quietly("STUDENT NOTE NOTIFICATION ERROR", async () => {
        if (auth.role === "supervisor") {
          await notifyCoordinators({
            title: "Note from a supervisor",
            message: `${authorName} wrote about ${student.name}: ${preview}`,
            type: "info",
            link: `/coordinator/students/${id}?tab=notes`,
          });
        } else if (student.supervisor_id) {
          await createNotification({
            supervisorId: student.supervisor_id,
            title: "Note from the OJT coordinator",
            message: `${authorName} wrote about ${student.name}: ${preview}`,
            type: "info",
            link: `/supervisor/interns/${id}?tab=notes`,
          });
        }
      });
      return res.status(201).json({ message: "Note added.", note: saved.rows[0], student_id: student.student_id });
    } catch (error) {
      console.error("ADD STUDENT NOTE ERROR:", error);
      return res.status(500).json({ message: "Failed to add the note." });
    }
  });

  /*
  | A coordinator reminds a supervisor who has reviews waiting. Once a day
  | per supervisor, whoever sends it, so a supervisor is never told the same
  | thing five times by five people.
  */

  app.post("/api/coordinator/supervisors/:supervisorId/remind", requireCoordinator, async (req, res) => {
    try {
      const supervisorId = String(req.params.supervisorId);
      const supervisor = await pool.query<{ name: string }>(
        `SELECT name FROM supervisors WHERE supervisor_id = $1 AND is_active = TRUE`,
        [supervisorId]
      );
      if (supervisor.rows.length === 0) return res.status(404).json({ message: "Supervisor not found." });

      const waiting = await pool.query<{ kind: string; items: number; oldest_days: number }>(
        `WITH waiting AS (
           SELECT 'attendance log' AS kind, a.time_out AS since FROM attendance a JOIN students s ON s.student_id = a.student_id
             WHERE s.is_active = TRUE AND s.supervisor_id = $1 AND a.status = 'Pending' AND a.time_out IS NOT NULL
           UNION ALL
           SELECT 'task submission', COALESCE(t.submitted_at, t.created_at) FROM tasks t JOIN students s ON s.student_id = t.student_id
             WHERE s.is_active = TRUE AND s.supervisor_id = $1 AND t.status = 'Submitted'
           UNION ALL
           SELECT 'document', d.uploaded_at FROM documents d JOIN students s ON s.student_id = d.student_id
             WHERE s.is_active = TRUE AND s.supervisor_id = $1 AND d.status = 'Pending'
           UNION ALL
           SELECT 'absence', b.created_at FROM absences b JOIN students s ON s.student_id = b.student_id
             WHERE s.is_active = TRUE AND s.supervisor_id = $1 AND b.status = 'Pending'
           UNION ALL
           SELECT 'weekly report', j.submitted_at FROM journals j JOIN students s ON s.student_id = j.student_id
             WHERE s.is_active = TRUE AND s.supervisor_id = $1 AND j.status = 'Submitted'
         )
         SELECT kind, COUNT(*)::int AS items,
                FLOOR(EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'Asia/Manila') - MIN(since)) / 86400)::int AS oldest_days
         FROM waiting GROUP BY kind ORDER BY kind`,
        [supervisorId]
      );
      const total = waiting.rows.reduce((sum, row) => sum + row.items, 0);
      if (total === 0) {
        return res.status(409).json({ message: `Nothing is waiting on ${supervisor.rows[0].name} now.` });
      }
      const oldest = Math.max(...waiting.rows.map((row) => row.oldest_days));

      // Claimed before it is sent: the second reminder of the day is refused.
      const { date: today } = manilaClock(new Date());
      const claimed = await pool.query(
        `INSERT INTO digest_log (kind, account_id, period_key) VALUES ('coordinator_nudge', $1, $2)
         ON CONFLICT (kind, account_id, period_key) DO NOTHING RETURNING id`,
        [supervisorId, today]
      );
      if (claimed.rows.length === 0) {
        return res.status(409).json({ message: `${supervisor.rows[0].name} has already been reminded today.` });
      }
      const list = waiting.rows
        .map((row) => count(row.items, row.kind, row.kind === "absence" ? "absences" : `${row.kind}s`))
        .join(", ");
      try {
        await createNotification({
          supervisorId,
          title: "Reminder from your OJT coordinator",
          message: `${count(total, "item is", "items are")} waiting for your review: ${list}. The oldest has waited ${count(oldest, "day", "days")}.`,
          type: "info",
          link: "/supervisor/dashboard",
        });
      } catch (error) {
        // Not sent: the day is not used up.
        await pool.query(`DELETE FROM digest_log WHERE id = $1`, [claimed.rows[0].id]).catch(() => undefined);
        throw error;
      }
      return res.json({
        message: `${supervisor.rows[0].name} was reminded about ${count(total, "item", "items")}.`,
        items: total,
        oldest_days: oldest,
        threshold_days: SLOW_REVIEW_DAYS,
      });
    } catch (error) {
      console.error("REMIND SUPERVISOR ERROR:", error);
      return res.status(500).json({ message: "Failed to send the reminder." });
    }
  });
}
