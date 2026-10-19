import type express from "express";
import type { Pool } from "pg";
import { sameId } from "../services/ids";
import { storedProjection } from "../services/projection";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S EXPECTED END DATE, AND HOW IT WAS WORKED OUT
|--------------------------------------------------------------------------
|
| Iteration 11. GET /api/students/:studentId/projection: the kept value
| (services/projection.ts), worked out first if there is none from today,
| with the reasoning a person can follow: hours required, verified and left;
| the pattern (one or two weeks) and its average hours; the day the walk
| started; the working days it counted; the holidays and approved absences
| it skipped; and why it is at risk, when it is.
|
| A student reads their own; a supervisor, their interns'; the coordinator,
| anyone's.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

export function registerProjectionRoutes(
  app: express.Express,
  deps: { pool: Pool; requireRole: (roles: Role[]) => express.RequestHandler }
): void {
  const { pool, requireRole } = deps;

  app.get("/api/students/:studentId/projection", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const studentId = String(req.params.studentId);
      const student = await pool.query<{ supervisor_id: string | null; is_active: boolean }>(
        `SELECT supervisor_id, is_active FROM students WHERE student_id = $1`,
        [studentId]
      );
      const row = student.rows[0];
      const allowed =
        auth.role === "coordinator" ||
        (auth.role === "student" && sameId(auth.id, studentId)) ||
        (auth.role === "supervisor" && Boolean(row) && sameId(row.supervisor_id, auth.id));
      if (!allowed) return res.status(403).json({ message: "You can only see your own, or your interns', expected end date." });
      if (!row) return res.status(404).json({ message: "Student not found." });
      if (!row.is_active) return res.json({ projection: null, message: "This student's account is not active." });

      const kept = await storedProjection(pool, studentId);
      if (!kept) return res.json({ projection: null });
      // Iteration 21: the expected end as it stood on each of the last 60 days,
      // for "Projected finish moved N days" (student_projection_snapshots).
      const history = await pool.query<{ date: string; projected_end_date: string | null; remaining_hours: number }>(
        `SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS date, TO_CHAR(projected_end_date, 'YYYY-MM-DD') AS projected_end_date,
                remaining_hours::float AS remaining_hours
         FROM student_projection_snapshots WHERE student_id = $1
         ORDER BY snapshot_date DESC LIMIT 60`,
        [studentId]
      );
      const hours = (value: number) => `${Math.round(value * 100) / 100} h`;
      // The reasoning, in the order a person would check it.
      const steps = [
        `Required ${hours(kept.required_hours)}, verified ${hours(kept.verified_hours)}: ${hours(kept.remaining_hours)} left.`,
        kept.pattern_weeks === 2
          ? `The schedule repeats every two weeks, ${hours(kept.weekly_hours)} a week on average.`
          : `The schedule is ${hours(kept.weekly_hours)} a week.`,
        ...(kept.walk_start && kept.remaining_hours > 0
          ? [
              `Counting scheduled days from ${kept.walk_start}: ${kept.working_days} working day${kept.working_days === 1 ? "" : "s"} cover it.`,
              ...(kept.holidays_skipped.length > 0 ? [`Holidays skipped: ${kept.holidays_skipped.join(", ")}.`] : []),
              ...(kept.absences_skipped.length > 0 ? [`Approved absences skipped: ${kept.absences_skipped.join(", ")}.`] : []),
            ]
          : []),
        ...(kept.risk_reason ? [kept.risk_reason] : []),
      ];
      return res.json({
        projection: {
          student_id: kept.student_id,
          projected_end_date: kept.projected_end_date,
          remaining_hours: kept.remaining_hours,
          at_risk: kept.at_risk,
          how: {
            required_hours: kept.required_hours,
            verified_hours: kept.verified_hours,
            remaining_hours: kept.remaining_hours,
            pattern_weeks: kept.pattern_weeks,
            weekly_hours: kept.weekly_hours,
            walk_start: kept.walk_start,
            working_days: kept.working_days,
            holidays_skipped: kept.holidays_skipped,
            absences_skipped: kept.absences_skipped,
            risk_reason: kept.risk_reason,
            steps,
          },
          cause: kept.cause,
          computed_at: kept.computed_at,
          history: history.rows.reverse(),
        },
      });
    } catch (error) {
      console.error("GET PROJECTION ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the expected end date." });
    }
  });
}
