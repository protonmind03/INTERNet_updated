import { useState } from "react";
import { Button, FormError, FormField, Modal } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import type { EvaluationForm } from "../../lib/useFinalEvaluation";
import { coordinatorRequest } from "./request";

type Row = { id: number; label: string; description: string };

/**
 * The final evaluation form: its name, the top of the rating scale, and
 * the criteria. Saving replaces the form supervisors fill in from now on;
 * evaluations already submitted keep the criteria they were written on.
 */
export default function EvaluationFormEditor({
  form,
  onClose,
  onSaved,
}: {
  form: EvaluationForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(form && !form.is_sample ? form.name : "");
  const [scale, setScale] = useState(String(form?.scale_max ?? 5));
  const [rows, setRows] = useState<Row[]>(() =>
    (form?.criteria ?? [{ label: "", description: "" }]).map((criterion, index) => ({
      id: index,
      label: criterion.label,
      description: criterion.description,
    }))
  );
  const [nextId, setNextId] = useState(rows.length);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (id: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const criteria = rows.filter((row) => row.label.trim());
    if (name.trim().length < 3) return setError("Give the form a name.");
    if (criteria.length < 2) return setError("A form needs at least two criteria.");
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/evaluation-form", {
        method: "PUT",
        body: {
          name,
          scale_max: Number(scale),
          criteria: criteria.map(({ label, description }) => ({ label, description })),
        },
      });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The form could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Final evaluation form"
      description="What supervisors rate each intern on at the end of the OJT."
      locked={saving}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="evaluation-form-editor" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save form"}
          </Button>
        </>
      }
    >
      <form id="evaluation-form-editor" onSubmit={submit} className="space-y-4">
        {form?.is_sample && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
            <span className="font-semibold">This is a sample form.</span> Replace the criteria
            below with the university's own, give the form its name, and save.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <FormField label="Form name" htmlFor="form-name">
            <input
              id="form-name"
              type="text"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, OJT Final Evaluation"
              className="field"
            />
          </FormField>
          <FormField label="Highest rating" htmlFor="form-scale">
            <select
              id="form-scale"
              value={scale}
              onChange={(event) => setScale(event.target.value)}
              className="field"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Criteria</legend>
          <ul className="mt-2 space-y-3">
            {rows.map((row, index) => (
              <li key={row.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      aria-label={`Criterion ${index + 1}`}
                      maxLength={80}
                      value={row.label}
                      onChange={(event) => change(row.id, { label: event.target.value })}
                      placeholder="Criterion, for example Quality of work"
                      className="field"
                    />
                    <input
                      type="text"
                      aria-label={`What criterion ${index + 1} means`}
                      maxLength={300}
                      value={row.description}
                      onChange={(event) => change(row.id, { description: event.target.value })}
                      placeholder="What it means (optional)"
                      className="field"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="trash"
                    aria-label={`Remove criterion ${index + 1}`}
                    disabled={rows.length <= 2}
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            icon="plus"
            disabled={rows.length >= 20}
            onClick={() => {
              setRows((current) => [...current, { id: nextId, label: "", description: "" }]);
              setNextId((value) => value + 1);
            }}
          >
            Add a criterion
          </Button>
        </fieldset>

        <p className="text-sm text-slate-500">
          Evaluations already submitted keep the criteria they were written on.
        </p>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
