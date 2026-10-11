import { useState } from "react";
import FinalEvaluationView from "../../components/FinalEvaluationView";
import { Button, Card, CardHeader, FormError, SkeletonRows } from "../../components/ui";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";
import {
  useEvaluationForm,
  useFinalEvaluation,
  type EvaluationForm,
  type FinalEvaluation,
} from "../../lib/useFinalEvaluation";

/*
|--------------------------------------------------------------------------
| FINAL EVALUATION (supervisor)
|--------------------------------------------------------------------------
|
| Once, at the end of an intern's OJT: a rating on every criterion of the
| coordinator's form, and overall remarks. It can be changed afterwards.
|
*/

export default function FinalEvaluationCard({
  intern,
}: {
  intern: { student_id: string; name: string } | undefined;
}) {
  const { form, loaded: formLoaded } = useEvaluationForm("supervisor");
  const { evaluation, loaded, reload } = useFinalEvaluation("supervisor", intern?.student_id);
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Final evaluation"
        description={
          intern
            ? `Of ${intern.name}, once, at the end of their OJT.`
            : "Choose an intern above to fill it in."
        }
        action={
          intern && evaluation && !editing ? (
            <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>
              Change
            </Button>
          ) : undefined
        }
      />
      {intern && (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
          {!loaded || !formLoaded ? (
            <SkeletonRows rows={3} />
          ) : evaluation && !editing ? (
            <FinalEvaluationView evaluation={evaluation} />
          ) : !form ? (
            <p className="text-sm text-slate-600">
              The OJT coordinator has not set up the evaluation form yet.
            </p>
          ) : (
            <FinalEvaluationForm
              // A different intern or form starts a clean form.
              key={`${intern.student_id}-${form.id}`}
              studentId={intern.student_id}
              form={form}
              existing={evaluation}
              onCancel={evaluation ? () => setEditing(false) : undefined}
              onSaved={async () => {
                await reload();
                setEditing(false);
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function FinalEvaluationForm({
  studentId,
  form,
  existing,
  onCancel,
  onSaved,
}: {
  studentId: string;
  form: EvaluationForm;
  existing: FinalEvaluation | null;
  onCancel?: () => void;
  onSaved: () => Promise<void>;
}) {
  // Earlier ratings carry over only where the criterion is still on the form.
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      form.criteria
        .map((criterion) => {
          const before = existing?.form_snapshot.criteria.find(
            (item) => item.label === criterion.label
          );
          const value = before ? existing?.ratings[before.key] : undefined;
          return [criterion.key, value && value <= form.scale_max ? value : 0];
        })
        .filter(([, value]) => value)
    )
  );
  const [remarks, setRemarks] = useState(existing?.remarks || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const scale = Array.from({ length: form.scale_max }, (_, index) => index + 1);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const missing = form.criteria.find((criterion) => !ratings[criterion.key]);
    if (missing) return setError(`Rate "${missing.label}".`);
    if (remarks.trim().length < 10) return setError("Write your overall remarks.");
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/final-evaluations/${encodeURIComponent(studentId)}`,
        withSupervisorAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form_id: form.id, ratings, remarks }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The evaluation could not be saved.");
      toast.success(data.message || "Final evaluation saved.");
      await onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The evaluation could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {form.is_sample && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
          <span className="font-semibold">Sample form.</span> These criteria are a sample until
          the OJT coordinator enters the university's own.
        </p>
      )}
      <p className="text-sm text-slate-600">
        Rate each from 1 (lowest) to {form.scale_max} (highest).
      </p>
      <ul className="space-y-4">
        {form.criteria.map((criterion) => (
          <li key={criterion.key}>
            <p className="text-sm font-medium text-slate-900">{criterion.label}</p>
            {criterion.description && (
              <p className="text-sm text-slate-500">{criterion.description}</p>
            )}
            <div
              role="radiogroup"
              aria-label={`Rating for ${criterion.label}`}
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {scale.map((value) => {
                const chosen = ratings[criterion.key] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    aria-label={`${value} out of ${form.scale_max}`}
                    onClick={() => {
                      setRatings((current) => ({ ...current, [criterion.key]: value }));
                      setError("");
                    }}
                    className={`tabular h-10 w-10 rounded-lg text-sm font-semibold ring-1 ring-inset transition-colors ${
                      chosen
                        ? "bg-psu-700 text-white ring-psu-700"
                        : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor="final-remarks" className="mb-1.5 block text-sm font-medium text-slate-700">
          Overall remarks
        </label>
        <textarea
          id="final-remarks"
          rows={4}
          maxLength={2000}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Strengths, what to improve, and whether you would recommend them."
          className="field resize-none"
        />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={saving} failed={Boolean(error)}>
          {saving ? "Saving" : existing ? "Save changes" : "Submit final evaluation"}
        </Button>
      </div>
    </form>
  );
}
