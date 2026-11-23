import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ErrorNotice, SkeletonRows } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { FALLBACK_REQUIRED_HOURS, isWholeHours, MAX_REQUIRED_HOURS } from "../../lib/requiredHours";
import { errorText, toast } from "../../lib/toast";
import CollegeRail from "./CollegeRail";
import { useChosenCollege } from "./useChosenCollege";
import { directorRead, directorWrite } from "./request";

/*
| Colleges and programs, for the Director (Phase 1.6): each program's
| required hours (migration 077), changed here once a Director exists, and
| the requirements it is asked before deployment (migration 078). The
| coordinators keep a read-only view on their Programs page; blocks stay
| theirs.
*/

type Academics = {
  colleges: { id: number; name: string; short_name: string | null; mark_key?: string | null; is_active: boolean }[];
  programs: { id: number; college_id: number; name: string; short_code: string; is_active: boolean; required_hours: number | null; students: number }[];
};
type Requirement = { id: number; name: string; is_active: boolean; pre_deployment?: boolean; applies_to?: { program_ids?: number[]; block_ids?: number[]; sex?: string[] } | null };

/** The requirements needed before deployment that are asked of a program's students. */
function packFor(programId: number, requirements: Requirement[]): string[] {
  return requirements
    .filter((item) => item.is_active && item.pre_deployment)
    .filter((item) => {
      const programs = item.applies_to?.program_ids ?? [];
      const blocks = item.applies_to?.block_ids ?? [];
      return (programs.length === 0 && blocks.length === 0) || programs.includes(programId);
    })
    .map((item) => (item.applies_to?.sex?.length === 1 ? `${item.name} (${item.applies_to.sex[0]} students)` : item.name));
}

export default function DirectorPrograms() {
  const [academics, setAcademics] = useState<Academics | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState("");
  const [chosen, choose] = useChosenCollege();
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalogue, list] = await Promise.all([
        directorRead<Academics>("academics", "/api/coordinator/academics"),
        directorRead<{ requirements: Requirement[] }>("requirements", "/api/ojt-requirements"),
      ]);
      setAcademics(catalogue);
      setRequirements(list.requirements);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The programs could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const saveHours = async (program: Academics["programs"][number]) => {
    const text = (editing[program.id] ?? "").trim();
    const hours = text ? Number(text) : null;
    if (hours !== null && !isWholeHours(hours)) {
      toast.error(`Required hours are a whole number from 1 to ${MAX_REQUIRED_HOURS}. Leave it empty for ${FALLBACK_REQUIRED_HOURS}.`);
      return;
    }
    setSaving(program.id);
    try {
      await directorWrite(`/api/coordinator/programs/${program.id}`, "PUT", { required_hours: hours });
      toast.success(`${program.short_code} hours saved: ${hours ?? FALLBACK_REQUIRED_HOURS} h for new students.`);
      setEditing((current) => {
        const next = { ...current };
        delete next[program.id];
        return next;
      });
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The hours could not be saved. Try again."));
    } finally {
      setSaving(null);
    }
  };

  const colleges = (academics?.colleges ?? []).filter((item) => item.is_active && (chosen === null || item.id === chosen));
  return (
    <DirectorLayout title="Programs">
      <div className="space-y-4">
        {academics && (
          <CollegeRail
            colleges={academics.colleges.filter((item) => item.is_active).map((item) => ({ id: item.id, name: item.name, short_name: item.short_name, mark_key: item.mark_key }))}
            chosen={chosen}
            onChoose={choose}
          />
        )}
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}
        {!academics && !error && (
          <Card className="p-4">
            <SkeletonRows rows={5} />
          </Card>
        )}
        {academics && academics.colleges.length === 0 && (
          <Card>
            <EmptyState icon="cap" title="No colleges yet" description="Coordinators add the colleges and programs until you take them over; they then show here." />
          </Card>
        )}
        {colleges.map((college) => {
          const programs = academics!.programs.filter((item) => item.college_id === college.id && item.is_active);
          return (
            <Card key={college.id}>
              <h2 className="border-b border-(--role-hairline) px-4 py-3 font-display text-lg font-bold text-(--role-ink)">{college.name}</h2>
              {programs.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-600">No active program in this college.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {programs.map((program) => {
                    const draft = editing[program.id];
                    const now = program.required_hours ?? FALLBACK_REQUIRED_HOURS;
                    const pack = packFor(program.id, requirements);
                    return (
                      <li key={program.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-(--role-ink)">
                            {program.short_code}: {program.name}
                          </p>
                          <p className="text-xs text-slate-600">{program.students} active {program.students === 1 ? "student" : "students"}</p>
                          {pack.length > 0 && (
                            <details className="mt-1 text-sm text-slate-700">
                              <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-psu-700">
                                {pack.length} {pack.length === 1 ? "requirement" : "requirements"} before deployment
                              </summary>
                              <p className="pb-1">{pack.join(", ")}</p>
                            </details>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            Required hours
                            <input
                              type="number"
                              min={1}
                              max={MAX_REQUIRED_HOURS}
                              inputMode="numeric"
                              aria-label={`Required hours for ${program.short_code}`}
                              value={draft ?? (program.required_hours === null ? "" : String(program.required_hours))}
                              placeholder={String(FALLBACK_REQUIRED_HOURS)}
                              onChange={(event) => setEditing((current) => ({ ...current, [program.id]: event.target.value }))}
                              className="field w-24 tabular-nums"
                            />
                          </label>
                          {draft !== undefined && (
                            <>
                              <span className="text-sm text-slate-600">
                                {now} h now, {draft.trim() ? Number(draft) : FALLBACK_REQUIRED_HOURS} h after
                              </span>
                              <Button size="sm" busy={saving === program.id} onClick={() => void saveHours(program)}>
                                Save hours
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
        {academics && <p className="text-sm text-slate-600">New students of a program start with its hours; students already registered keep theirs.</p>}
      </div>
    </DirectorLayout>
  );
}
