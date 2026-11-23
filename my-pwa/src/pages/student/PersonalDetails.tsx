import { useState } from "react";
import { Button, Card, FormError, FormField } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";

/*
| The student's own optional details (migration 078), saved through
| PUT /api/students/:id/personal, which checks them:
|
|   Sex             on Account; used only to choose the requirements asked
|                   of a student (the pregnancy test).
|   SSS, Pag-IBIG   on Contact; advised, for employment after OJT.
*/

export type Personal = {
  sex?: "female" | "male" | null;
  sss_number?: string | null;
  pagibig_number?: string | null;
};

async function savePersonal(studentId: string, body: Partial<Record<keyof Personal, string | null>>): Promise<Personal> {
  const response = await fetch(
    `${API_URL}/api/students/${encodeURIComponent(studentId)}/personal`,
    withStudentAuth({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Your details could not be saved. Try again.");
  return data.personal as Personal;
}

/** Sex, on Account, with the one reason it is asked. */
export function SexCard({ studentId, personal, onSaved }: { studentId: string; personal: Personal; onSaved: (personal: Personal) => void }) {
  const [sex, setSex] = useState(personal.sex ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved(await savePersonal(studentId, { sex: sex || null }));
      toast.success("Saved.");
    } catch (saveError) {
      setError(errorText(saveError, "Your details could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save} className="p-4 sm:p-5" noValidate>
        <FormField
          label="Sex"
          htmlFor="personal-sex"
          optional
          hint="Used only to choose which medical requirements you are asked for."
        >
          <select id="personal-sex" value={sex} onChange={(event) => setSex(event.target.value)} className="field max-w-64">
            <option value="">Not given</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </FormField>
        <FormError message={error} />
        <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(error)} disabled={sex === (personal.sex ?? "")} className="mt-4">
          {saving ? "Saving" : "Save"}
        </Button>
      </form>
    </Card>
  );
}

/** SSS and Pag-IBIG numbers, on Contact. */
export function GovernmentNumbersCard({
  studentId,
  personal,
  onSaved,
}: {
  studentId: string;
  personal: Personal;
  onSaved: (personal: Personal) => void;
}) {
  const [sss, setSss] = useState(personal.sss_number ?? "");
  const [pagibig, setPagibig] = useState(personal.pagibig_number ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changed = sss.trim() !== (personal.sss_number ?? "") || pagibig.trim() !== (personal.pagibig_number ?? "");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = (value: string) => value.replace(/\D/g, "").length;
    if (sss.trim() && digits(sss) !== 10) return setError("An SSS number has 10 digits, as in 34-5678901-2.");
    if (pagibig.trim() && digits(pagibig) !== 12) return setError("A Pag-IBIG MID number has 12 digits, as in 1234-5678-9012.");
    setSaving(true);
    setError("");
    try {
      const saved = await savePersonal(studentId, { sss_number: sss.trim() || null, pagibig_number: pagibig.trim() || null });
      setSss(saved.sss_number ?? "");
      setPagibig(saved.pagibig_number ?? "");
      onSaved(saved);
      toast.success("Numbers saved.");
    } catch (saveError) {
      setError(errorText(saveError, "Your numbers could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={save} noValidate>
        <h2 className="text-[16px] font-bold text-slate-900">SSS and Pag-IBIG</h2>
        <p className="mt-1 text-sm text-slate-600">Advised, for employment after OJT. Only you and the OJT office see them.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="SSS number" htmlFor="personal-sss" optional>
            <input
              id="personal-sss"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="34-5678901-2"
              value={sss}
              onChange={(event) => setSss(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Pag-IBIG MID number" htmlFor="personal-pagibig" optional>
            <input
              id="personal-pagibig"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="1234-5678-9012"
              value={pagibig}
              onChange={(event) => setPagibig(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormError message={error} />
        <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(error)} disabled={!changed} className="mt-4">
          {saving ? "Saving" : "Save numbers"}
        </Button>
      </form>
    </Card>
  );
}
