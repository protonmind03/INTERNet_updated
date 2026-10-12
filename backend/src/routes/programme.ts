import type express from "express";
import type { Pool } from "pg";
import { programmeReport, studentPerformance } from "../services/insights";
import {
  BEHIND_AFTER_SCHEDULED_DAYS,
  BEHIND_ATTENDANCE_PERCENT,
  BEHIND_LATE_TASKS,
  LATE_AFTER_MINUTES,
  PERFORMANCE_RULES,
} from "../services/performance";
import { readStudentFilters } from "../services/studentScope";

/*
|--------------------------------------------------------------------------
| THE PROGRAMME, FOR THE COORDINATOR (Round 2, Phase 5)
|--------------------------------------------------------------------------
|
|   performance   each student's figures, status word and sentence
|
| Every route here is the coordinator's.
|
*/

type Role = "student" | "supervisor" | "coordinator";
export type Authed = express.Request & { auth?: { role: Role; id: string } };

export type ProgrammeDependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
};

export function registerProgrammeRoutes(app: express.Express, deps: ProgrammeDependencies): void {
  const { pool, requireCoordinator } = deps;

  /*
  | Student performance
  */

  // What the status words mean, sent with the figures so the page explains
  // them from the same place they are decided.
  const explained = {
    rules: PERFORMANCE_RULES,
    thresholds: {
      late_after_minutes: LATE_AFTER_MINUTES,
      behind_attendance_percent: BEHIND_ATTENDANCE_PERCENT,
      behind_after_scheduled_days: BEHIND_AFTER_SCHEDULED_DAYS,
      behind_late_tasks: BEHIND_LATE_TASKS,
    },
  };

  app.get("/api/coordinator/performance", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const report = await programmeReport(pool, read.filters, new Date(), { performance: true });
      return res.json({ students: report.students, ...explained });
    } catch (error) {
      console.error("GET PERFORMANCE ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the students' performance." });
    }
  });

  // One student's, for the top of their record. Null for a student who is
  // not active: there is nothing current to say about them.
  app.get("/api/coordinator/students/:studentId/performance", requireCoordinator, async (req, res) => {
    try {
      const found = await studentPerformance(pool, String(req.params.studentId));
      return res.json({ student: found, ...explained });
    } catch (error) {
      console.error("GET STUDENT PERFORMANCE ERROR:", error);
      return res.status(500).json({ message: "Failed to work out this student's performance." });
    }
  });
}
