import { useState } from "react";
import { Button, Card } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { saveCsv } from "../../lib/csv";
import { phToday } from "../../lib/phTime";
import { errorText, toast } from "../../lib/toast";
import { directorRead } from "./request";

/*
| Campus exports (Phase 1.6): the overview by college, and every student's
| clearance, as CSV. Built from the same answers the pages show.
*/

type Overview = {
  colleges: { college: string | null; interns: number; cleared: number; on_track: number; at_risk: number; agreements_ending: number }[];
};
type Student = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  eligibility_status: string;
  cleared: boolean;
  at_risk: boolean;
  clearance_override_reason: string | null;
  missing: string[];
};

export default function DirectorReports() {
  const [busy, setBusy] = useState("");

  const run = async (name: string, build: () => Promise<void>) => {
    setBusy(name);
    try {
      await build();
      toast.success("Export ready to download.");
    } catch (error) {
      toast.error(errorText(error, "The export could not be built. Check your connection and try again."));
    } finally {
      setBusy("");
    }
  };

  const byCollege = () =>
    run("colleges", async () => {
      const data = await directorRead<Overview>("overview", "/api/director/overview");
      saveCsv(
        [
          ["College", "Interns", "Cleared", "On track", "At risk", "Agreements ending within 30 days"],
          ...data.colleges.map((row) => [row.college ?? "No program yet", row.interns, row.cleared, row.on_track, row.at_risk, row.agreements_ending]),
        ],
        `campus-by-college-${phToday()}.csv`
      );
    });

  const clearances = () =>
    run("students", async () => {
      const data = await directorRead<{ students: Student[] }>("clearance", "/api/coordinator/clearance");
      saveCsv(
        [
          ["Student ID", "Name", "Program", "Company", "Eligibility", "Cleared", "At risk", "Still needed", "Cleared anyway, because"],
          ...data.students.map((row) => [
            row.student_id,
            row.name,
            row.program ?? "",
            row.company ?? "",
            row.eligibility_status,
            row.cleared ? "yes" : "no",
            row.at_risk ? "yes" : "no",
            row.missing.join("; "),
            row.clearance_override_reason ?? "",
          ]),
        ],
        `campus-clearance-${phToday()}.csv`
      );
    });

  return (
    <DirectorLayout title="Reports">
      <Card>
        <ul className="divide-y divide-slate-100">
          <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-(--role-ink)">The campus by college</h2>
              <p className="text-sm text-slate-700">Interns, cleared, on track, at risk and agreements ending, one row a college.</p>
            </div>
            <Button variant="secondary" icon="download" busy={busy === "colleges"} busyProcess="export" onClick={() => void byCollege()}>
              Download CSV
            </Button>
          </li>
          <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-(--role-ink)">Every student's clearance</h2>
              <p className="text-sm text-slate-700">Eligibility, what is still needed, and every clearance given anyway with its reason.</p>
            </div>
            <Button variant="secondary" icon="download" busy={busy === "students"} busyProcess="export" onClick={() => void clearances()}>
              Download CSV
            </Button>
          </li>
        </ul>
      </Card>
    </DirectorLayout>
  );
}
