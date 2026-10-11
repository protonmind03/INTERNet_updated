import type express from "express";
import type { Pool } from "pg";
import { coordinatorActions } from "../services/coordinatorActions";
import { coordinatorKpis } from "../services/kpis";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S CONSOLE
|--------------------------------------------------------------------------
|
| What the coordinator's dashboard and Analytics show at the top, counted
| on the server: the action list (who has to do what) and the six key
| figures with their targets. Both read only, both for the coordinator
| only, and both take the same optional `term` the other coordinator pages
| take: a term's id, or "none" for students with no term.
|
*/

type Dependencies = {
  pool: Pool;
  requireCoordinator: express.RequestHandler;
  /** The server's rule for a flagged attendance log, as SQL on an alias. */
  flaggedLogCondition: (alias: string) => string;
};

/** The chosen term, undefined for all of them, or null when it is not a term. */
function readTerm(value: unknown): number | "none" | undefined | null {
  if (value === undefined || value === "") return undefined;
  const term = typeof value === "string" ? value.trim() : "";
  if (term === "none") return "none";
  return /^[0-9]{1,9}$/.test(term) ? Number(term) : null;
}

export function registerConsoleRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator, flaggedLogCondition } = deps;

  app.get("/api/coordinator/actions", requireCoordinator, async (req, res) => {
    try {
      const termId = readTerm(req.query.term);
      if (termId === null) return res.status(400).json({ message: "That is not a term." });
      return res.json(await coordinatorActions(pool, { termId, flagged: flaggedLogCondition("a") }));
    } catch (error) {
      console.error("COORDINATOR ACTIONS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the action list." });
    }
  });

  app.get("/api/coordinator/kpis", requireCoordinator, async (req, res) => {
    try {
      const termId = readTerm(req.query.term);
      if (termId === null) return res.status(400).json({ message: "That is not a term." });
      return res.json(await coordinatorKpis(pool, termId));
    } catch (error) {
      console.error("COORDINATOR KPIS ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the key figures." });
    }
  });
}
