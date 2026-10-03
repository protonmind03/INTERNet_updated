import type { Pool } from "pg";
import { isSmtpConfigured, sendEmail } from "./mailer";

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

export function startDeadlineReminderScheduler(
  pool: Pool,
  createNotification: NotificationWriter
): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await pool.query(
        `
        INSERT INTO task_deadline_reminders(task_id, reminder_type, scheduled_at)
        SELECT t.id, '24_hours',
               (((t.due_date + 1)::timestamp - INTERVAL '1 second' - INTERVAL '24 hours')
                 AT TIME ZONE 'Asia/Manila')
        FROM tasks t
        WHERE t.status IN ('Pending', 'In Progress')
          AND (((t.due_date + 1)::timestamp - INTERVAL '1 second' - INTERVAL '24 hours')
                 AT TIME ZONE 'Asia/Manila') BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
        UNION ALL
        SELECT t.id, 'deadline',
               (((t.due_date + 1)::timestamp - INTERVAL '1 second')
                 AT TIME ZONE 'Asia/Manila')
        FROM tasks t
        WHERE t.status IN ('Pending', 'In Progress')
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
            [isSmtpConfigured(), MAX_EMAIL_ATTEMPTS]
          );
          if (pending.rows.length === 0) {
            await client.query("COMMIT");
            break;
          }

          const reminder = pending.rows[0];
          const emailDue =
            isSmtpConfigured() &&
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
              await sendEmail({
                to: reminder.student_email,
                subject: isDue
                  ? `Task deadline: ${reminder.title}`
                  : `Task due in 24 hours: ${reminder.title}`,
                text: `Hello ${reminder.student_name},\n\n${deadlineText}\nPlease sign in to INTERNet to review your task.`,
              });
              await client.query(
                `UPDATE task_deadline_reminders
                 SET email_sent_at = NOW() WHERE id = $1`,
                [reminder.id]
              );
            } catch (error) {
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
          } else if (!reminder.email_sent_at && !isSmtpConfigured() && !warnedAboutSmtp) {
            warnedAboutSmtp = true;
            console.error(
              "Task deadline email reminders are pending SMTP configuration; configure SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, and SMTP_PASSWORD."
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
