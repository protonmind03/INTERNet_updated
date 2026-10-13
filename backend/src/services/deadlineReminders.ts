import type { Pool } from "pg";
import { isEmailConfigured, sendEmail } from "./mailer";
import { EmailLimitError } from "./emailBudget";
import { allowsChannel } from "./notificationPreferences";
import { releaseDueTasks, released } from "./taskRelease";
import { createWeeklyItems, sendDeliverableReminders } from "./deliverables";

type NotificationWriter = (notification: {
  studentId?: string;
  supervisorId?: string;
  title: string;
  message: string;
  type: string;
}) => Promise<void>;

const MAX_EMAIL_ATTEMPTS = 5;

let running = false;
let warnedAboutSmtp = false;
let warnedAboutLimit = false;

export function startDeadlineReminderScheduler(
  pool: Pool,
  createNotification: NotificationWriter
): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      // Tasks whose release day has come are announced first, once each.
      try {
        await releaseDueTasks(pool, createNotification);
      } catch (error) {
        console.error("TASK RELEASE ERROR:", error);
      }
      // Deliverables: this week's item of each weekly one, then a reminder
      // for whatever is due today or tomorrow and not handed in. Both are
      // safe to repeat every round.
      try {
        await createWeeklyItems(pool);
        await sendDeliverableReminders(pool, createNotification);
      } catch (error) {
        console.error("DELIVERABLE LOOP ERROR:", error);
      }
      // A task the intern cannot see yet gets no deadline reminder.
      await pool.query(
        `
        INSERT INTO task_deadline_reminders(task_id, reminder_type, scheduled_at)
        SELECT t.id, '24_hours',
               (((t.due_date + 1)::timestamp - INTERVAL '1 second' - INTERVAL '24 hours')
                 AT TIME ZONE 'Asia/Manila')
        FROM tasks t
        WHERE t.status IN ('Pending', 'In Progress')
          AND ${released("t.")}
          AND (((t.due_date + 1)::timestamp - INTERVAL '1 second' - INTERVAL '24 hours')
                 AT TIME ZONE 'Asia/Manila') BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
        UNION ALL
        SELECT t.id, 'deadline',
               (((t.due_date + 1)::timestamp - INTERVAL '1 second')
                 AT TIME ZONE 'Asia/Manila')
        FROM tasks t
        WHERE t.status IN ('Pending', 'In Progress')
          AND ${released("t.")}
          AND (((t.due_date + 1)::timestamp - INTERVAL '1 second')
                 AT TIME ZONE 'Asia/Manila') BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
        ON CONFLICT (task_id, reminder_type) DO NOTHING
        `
      );

      while (true) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const pending = await client.query<{
            id: number;
            reminder_type: "24_hours" | "deadline";
            notification_sent_at: Date | null;
            email_sent_at: Date | null;
            email_attempts: number;
            email_next_attempt_at: Date | null;
            student_id: string;
            student_email: string;
            student_name: string;
            assigned_by_id: string | null;
            title: string;
            due_date: string;
          }>(
            `
            SELECT r.id, r.reminder_type, r.notification_sent_at, r.email_sent_at,
                   r.email_attempts, r.email_next_attempt_at,
                   t.student_id, s.email AS student_email, s.name AS student_name,
                   t.assigned_by_id, t.title, t.due_date::text AS due_date
            FROM task_deadline_reminders r
            JOIN tasks t ON t.id = r.task_id
            JOIN students s ON s.student_id = t.student_id
            WHERE r.scheduled_at <= NOW()
              AND t.status IN ('Pending', 'In Progress')
              AND ${released("t.")}
              AND (
                r.notification_sent_at IS NULL
                OR (
                  r.email_sent_at IS NULL
                  AND $1::boolean
                  AND r.email_attempts < $2
                  AND (r.email_next_attempt_at IS NULL OR r.email_next_attempt_at <= NOW())
                )
              )
            ORDER BY r.scheduled_at, r.id
            LIMIT 1
            FOR UPDATE OF r SKIP LOCKED
            `,
            [isEmailConfigured(), MAX_EMAIL_ATTEMPTS]
          );
          if (pending.rows.length === 0) {
            await client.query("COMMIT");
            break;
          }

          const reminder = pending.rows[0];
          const emailDue =
            isEmailConfigured() &&
            !reminder.email_sent_at &&
            reminder.email_attempts < MAX_EMAIL_ATTEMPTS &&
            (!reminder.email_next_attempt_at ||
              new Date(reminder.email_next_attempt_at).getTime() <= Date.now());
          const deadlineText = `The task "${reminder.title}" is due on ${reminder.due_date} (Philippine time).`;
          const isDue = reminder.reminder_type === "deadline";
          if (!reminder.notification_sent_at) {
            await createNotification({
              studentId: reminder.student_id,
              title: isDue ? "Task deadline reached" : "Task due in 24 hours",
              message: deadlineText,
              type: "task",
            });
            // The supervisor who assigned it hears once, when it goes overdue.
            if (isDue && reminder.assigned_by_id) {
              await createNotification({
                supervisorId: reminder.assigned_by_id,
                title: "Task past its deadline",
                message: `${reminder.student_name} has not submitted "${reminder.title}", which was due on ${reminder.due_date}.`,
                type: "task",
              });
            }
            await client.query(
              `UPDATE task_deadline_reminders
               SET notification_sent_at = NOW() WHERE id = $1`,
              [reminder.id]
            );
          }

          if (emailDue) {
            try {
              // A student who turned task emails off still gets the in-app
              // reminder above; the email is counted as dealt with.
              if (await allowsChannel(pool, "student", reminder.student_id, "task", "email")) {
                await sendEmail({
                  to: reminder.student_email,
                  subject: isDue
                    ? `Task deadline: ${reminder.title}`
                    : `Task due in 24 hours: ${reminder.title}`,
                  text: `Hello ${reminder.student_name},\n\n${deadlineText}\nPlease sign in to INTERNet to review your task.`,
                });
              }
              await client.query(
                `UPDATE task_deadline_reminders
                 SET email_sent_at = NOW() WHERE id = $1`,
                [reminder.id]
              );
            } catch (error) {
              if (error instanceof EmailLimitError) {
                // The day's allowance is used. A deadline email a day late
                // would be wrong, and the student has the in-app reminder,
                // so this one is not tried again.
                if (!warnedAboutLimit) {
                  warnedAboutLimit = true;
                  console.error("Task deadline emails have stopped for today: " + error.message);
                }
                await client.query(
                  `UPDATE task_deadline_reminders SET email_attempts = $2 WHERE id = $1`,
                  [reminder.id, MAX_EMAIL_ATTEMPTS]
                );
                await client.query("COMMIT");
                continue;
              }
              console.error("SEND TASK DEADLINE EMAIL ERROR:", error);
              // Try again later (5, 10, 20, 40 minutes), then give up. The
              // row drops out of the queue meanwhile, so the reminders
              // behind it are not held up.
              await client.query(
                `UPDATE task_deadline_reminders
                 SET email_attempts = email_attempts + 1,
                     email_next_attempt_at =
                       NOW() + INTERVAL '5 minutes' * POWER(2, email_attempts)
                 WHERE id = $1`,
                [reminder.id]
              );
            }
          } else if (!reminder.email_sent_at && !isEmailConfigured() && !warnedAboutSmtp) {
            warnedAboutSmtp = true;
            console.error(
              "Task deadline email reminders are waiting for email to be configured: EMAIL_PROVIDER, EMAIL_API_KEY and SMTP_FROM, or the five SMTP_* settings."
            );
          }

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("TASK DEADLINE REMINDER ERROR:", error);
          break;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      console.error("DEADLINE REMINDER SCHEDULER ERROR:", error);
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => void run(), 60_000);
}
