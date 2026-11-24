import { useEffect, useState } from "react";
import { Button, Card, CardHeader, FormError } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.2: the programs a company takes. Students choosing their agency
| see it only when it takes their program; none ticked means any program.
*/

type Program = { id: number; name: string; short_code: string; is_active: boolean };

export default function CompanyPrograms({ company, onSaved }: { company: { id: number; program_ids?: number[] }; onSaved: () => void }) {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [ticked, setTicked] = useState<number[]>(company.program_ids ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void coordinatorRequest<{ programs: Program[] }>("/api/coordinator/academics")
      .then((data) => setPrograms(data.programs.filter((program) => program.is_active)))
      .catch(() => setPrograms([]));
  }, []);

  if (programs === null || programs.length === 0) return null;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/company-records/${company.id}/programs`, { method: "PUT", body: { program_ids: ticked } });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The programs could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon="users" title="Programs it takes" description="Students choosing an agency see this company only if it takes their program. None ticked: any program." />
      <fieldset className="space-y-1 px-4 pb-5 pt-3 sm:px-5">
        <legend className="sr-only">Programs this company takes</legend>
        {programs.map((program) => (
          <label key={program.id} className="flex min-h-11 items-center gap-3 text-sm text-slate-900">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={ticked.includes(program.id)}
              onChange={(event) => setTicked((current) => (event.target.checked ? [...current, program.id] : current.filter((id) => id !== program.id)))}
            />
            {program.short_code}, {program.name}
          </label>
        ))}
        <FormError message={error} />
        <div className="pt-2">
          <Button busy={busy} onClick={() => void save()}>Save the programs</Button>
        </div>
      </fieldset>
    </Card>
  );
}
