import type express from "express";
import type { Pool } from "pg";
import { fenceOf, readFence } from "../services/geofence";
import { sameId } from "../services/ids";
import { ojtSetting } from "../services/ojtSettings";

/*
| Phase 2.1: the geofence's two routes.
|
|   the company's point    set by the coordinator (pasted coordinates, or
|                          this phone's location at the site); nulls clear it
|   the student's fence    the rule and their company's point, so the phone
|                          knows whether to ask for its location and can work
|                          out the distance itself when offline. A company's
|                          point is not personal, so the phone may keep it.
*/

type Role = "student" | "supervisor" | "coordinator" | "director";
type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
};

export function registerGeofenceRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator } = deps;

  app.put("/api/coordinator/company-records/:id/geofence", requireCoordinator, async (req, res) => {
    try {
      const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : null;
      if (id === null) return res.status(404).json({ message: "Company not found." });
      const read = readFence(req.body ?? {});
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const saved = await pool.query(
        `UPDATE companies SET latitude = $2, longitude = $3, radius_m = $4, updated_at = NOW() WHERE id = $1 RETURNING name`,
        [id, read.latitude, read.longitude, read.radius_m]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Company not found." });
      return res.json({
        message: read.latitude === null ? "Location removed." : `Location saved, with a ${read.radius_m} m radius.`,
        fence: read,
      });
    } catch (error) {
      console.error("SAVE GEOFENCE ERROR:", error);
      return res.status(500).json({ message: "Failed to save the location." });
    }
  });

  app.get("/api/students/:studentId/geofence", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own." });
      const [mode, fence] = await Promise.all([ojtSetting(pool, "geofence_mode"), fenceOf(pool, auth.id)]);
      return res.json({ mode, fence: mode === "off" ? null : fence });
    } catch (error) {
      console.error("GET GEOFENCE ERROR:", error);
      return res.status(500).json({ message: "Failed to read the location check." });
    }
  });
}
