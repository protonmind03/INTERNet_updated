import type express from "express";
import type { Pool } from "pg";
import { coordinatorActions } from "../services/coordinatorActions";
import { coordinatorKpis } from "../services/kpis";
import { readStudentFilters } from "../services/studentScope";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S CONSOLE
|--------------------------------------------------------------------------
|
| What the coordinator's dashboard and Analytics show at the top, counted
| on the server: the action list (who has to do what) and the six key
| figures with their targets. Both read only, both for the coordinator
| only, and both take the same optional filters the other coordinator
| pages take (services/studentScope.ts): term, college, program, block,
| company and supervisor.
|
*/

type Dependencies = {
  pool: Pool;
  requireCoordinator: express.RequestHandler;
  /** The server's rule for a flagged attendance log, as SQL on an alias. */
  flaggedLogCondition: (alias: string) => string;
};

export function registerConsoleRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator, flaggedLogCondition } = deps;

  app.get("/api/coordinator/actions", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      return res.json(
        await coordinatorActions(pool, { filters: read.filters, flagged: flaggedLogCondition("a") })
      );
    } catch (error) {
      console.error("COORDINATOR ACTIONS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the action list." });
    }
  });

  app.get("/api/coordinator/kpis", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      return res.json(await coordinatorKpis(pool, read.filters));
    } catch (error) {
      console.error("COORDINATOR KPIS ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the key figures." });
    }
  });
}
