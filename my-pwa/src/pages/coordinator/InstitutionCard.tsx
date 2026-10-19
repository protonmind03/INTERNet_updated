import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorNotice, FormError, FormField } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Iteration 18 (migration 068): the lines printed above every trainee's
| Daily Time Record. Edited here, on the coordinator's Profile; each save is
| audited on the server.
*/

type Institution = {
  republic_line: string;
  university_name: string;
  campus_name: string;
  locality_line: string;
};

const FIELDS: Array<{ key: keyof Institution; label: string; hint: string }> = [
  { key: "republic_line", label: "Republic line", hint: "Printed first, in capitals." },
  { key: "university_name", label: "University name", hint: "Printed large, in the blackletter type." },
  { key: "campus_name", label: "Campus name", hint: "As it should print, for example LINGAYEN CAMPUS." },
  { key: "locality_line", label: "Locality line", hint: "Printed under the program." },
];

const EMPTY: Institution = { republic_line: "", university_name: "", campus_name: "", locality_line: "" };

export default function InstitutionCard() {
  const [saved, setSaved] = useState<Institution | null>(null);
  const [draft, setDraft] = useState<Institution>(EMPTY);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ institution: Institution }>("/api/coordinator/institution");
      setSaved(data.institution);
      setDraft(data.institution);
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error, "Could not load the institution details."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const changed = saved !== null && FIELDS.some(({ key }) => draft[key].trim() !== saved[key]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const short = FIELDS.find(({ key }) => draft[key].trim().length < 2);
    if (short) return setFormError(`Fill in the ${short.label.toLowerCase()}.`);
    setSaving(true);
    setFormError("");
    try {
      const data = await coordinatorRequest<{ institution: Institution }>("/api/coordinator/institution", {
        method: "PUT",
        body: Object.fromEntries(FIELDS.map(({ key }) => [key, draft[key].trim()])),
      });
      setSaved(data.institution);
      setDraft(data.institution);
      toast.success("Institution details saved.");
    } catch (error) {
      setFormError(errorText(error, "The institution details could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save} className="p-4 sm:p-5" noValidate aria-labelledby="institution-heading">
        <h2 id="institution-heading" className="text-sm font-semibold text-slate-900">
          Institution details
        </h2>
        <p className="mt-1 text-sm text-slate-600">The lines printed above every trainee's Time Record.</p>
        {loadError && (
          <div className="mt-3">
            <ErrorNotice message={loadError} onRetry={() => void load()} />
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {FIELDS.map(({ key, label, hint }) => (
            <FormField key={key} label={label} htmlFor={`institution-${key}`} hint={hint}>
              <input
                id={`institution-${key}`}
                type="text"
                maxLength={120}
                value={draft[key]}
                disabled={saved === null}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                className="field"
              />
            </FormField>
          ))}
        </div>
        <div className="mt-3">
          <FormError message={formError} />
        </div>
        <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(formError)} disabled={!changed} className="mt-4">
          {saving ? "Saving" : "Save institution details"}
        </Button>
      </form>
    </Card>
  );
}
