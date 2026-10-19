import type express from "express";
import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| THE INSTITUTION'S LINES
|--------------------------------------------------------------------------
|
| Iteration 18 (migration 068). The lines printed above the Daily Time
| Record: the republic, the university, the campus, the locality, and which
| seal the app shows. One row. The coordinator reads and edits it on their
| Profile ("Institution details"); every change is audited
| (services/audit.ts).
|
*/

type Dependencies = { pool: Pool; requireCoordinator: express.RequestHandler };

export const INSTITUTION_FIELDS = ["republic_line", "university_name", "campus_name", "locality_line"] as const;

export type Institution = {
  republic_line: string;
  university_name: string;
  campus_name: string;
  locality_line: string;
  seal_asset: string;
  updated_at?: string;
};

/** What the Time Record prints when the row is missing (a database before 068). */
export const DEFAULT_INSTITUTION: Institution = {
  republic_line: "REPUBLIC OF THE PHILIPPINES",
  university_name: "Pangasinan State University",
  campus_name: "LINGAYEN CAMPUS",
  locality_line: "LINGAYEN, PANGASINAN",
  seal_asset: "psu-seal",
};

/** The one row, or the defaults. */
export async function loadInstitution(pool: Pick<Pool, "query">): Promise<Institution> {
  try {
    const found = await pool.query<Institution>(
      `SELECT republic_line, university_name, campus_name, locality_line, seal_asset, updated_at
       FROM institution_profile WHERE id = 1`
    );
    return found.rows[0] ?? DEFAULT_INSTITUTION;
  } catch {
    return DEFAULT_INSTITUTION;
  }
}

/** The fields of a PUT, each 2 to 120 characters, or what is wrong. */
export function readInstitution(body: unknown): { problem: string } | { values: Record<(typeof INSTITUTION_FIELDS)[number], string> } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const values = {} as Record<(typeof INSTITUTION_FIELDS)[number], string>;
  const names: Record<(typeof INSTITUTION_FIELDS)[number], string> = {
    republic_line: "The republic line",
    university_name: "The university's name",
    campus_name: "The campus name",
    locality_line: "The locality line",
  };
  for (const field of INSTITUTION_FIELDS) {
    const value = typeof input[field] === "string" ? (input[field] as string).trim().replace(/\s+/g, " ") : "";
    if (value.length < 2 || value.length > 120) return { problem: `${names[field]} must be 2 to 120 characters.` };
    values[field] = value;
  }
  return { values };
}

export function registerInstitutionRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator } = deps;

  app.get("/api/coordinator/institution", requireCoordinator, async (_req, res) => {
    try {
      return res.json({ institution: await loadInstitution(pool) });
    } catch (error) {
      console.error("GET INSTITUTION ERROR:", error);
      return res.status(500).json({ message: "Failed to load the institution details." });
    }
  });

  app.put("/api/coordinator/institution", requireCoordinator, async (req, res) => {
    const read = readInstitution(req.body);
    if ("problem" in read) return res.status(400).json({ message: read.problem });
    try {
      const saved = await pool.query<Institution>(
        `INSERT INTO institution_profile (id, republic_line, university_name, campus_name, locality_line, seal_asset)
         VALUES (1, $1, $2, $3, $4, 'psu-seal')
         ON CONFLICT (id) DO UPDATE SET
           republic_line = EXCLUDED.republic_line,
           university_name = EXCLUDED.university_name,
           campus_name = EXCLUDED.campus_name,
           locality_line = EXCLUDED.locality_line,
           updated_at = NOW()
         RETURNING republic_line, university_name, campus_name, locality_line, seal_asset, updated_at`,
        [read.values.republic_line, read.values.university_name, read.values.campus_name, read.values.locality_line]
      );
      return res.json({ message: "Institution details saved.", institution: saved.rows[0] });
    } catch (error) {
      console.error("SAVE INSTITUTION ERROR:", error);
      return res.status(500).json({ message: "Failed to save the institution details." });
    }
  });
}
