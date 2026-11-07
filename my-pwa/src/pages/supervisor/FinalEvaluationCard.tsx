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
import { TERMINATION_REASONS, isWeighted, letterOf, ojtGrade, type Outcome } from "../../lib/ojtGrade";

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
  const [outcome, setOutcome] = useState<Outcome>(existing?.outcome ?? {});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // From the top of the scale down, as the university's form lists them.
  const scale = Array.from({ length: form.scale_max }, (_, index) => form.scale_max - index);
  const weighted = isWeighted(form.criteria);
  const grade = ojtGrade(form.criteria, ratings, form.scale_max);
  const rated = form.criteria.filter((criterion) => ratings[criterion.key]).length;

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
          body: JSON.stringify({ form_id: form.id, ratings, remarks, outcome }),
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

  const toggleReason = (reason: string) =>
    setOutcome((current) => {
      const list = current.terminated ?? [];
      return { ...current, terminated: list.includes(reason) ? list.filter((item) => item !== reason) : [...list, reason] };
    });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {form.is_sample && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
          <span className="font-semibold">Sample form.</span> These criteria are a sample until
          the OJT coordinator enters the university's own.
        </p>
      )}
      <p className="text-sm text-slate-600">
        {weighted
          ? "Evaluate the student-intern fairly and honestly, considering their time in the trade. Rate every competency by choosing the sentence that best describes their performance."
          : `Rate each from 1 (lowest) to ${form.scale_max} (highest).`}
      </p>
      <ol className="space-y-4">
        {form.criteria.map((criterion, index) => (
          <li key={criterion.key} className="rounded-xl ring-1 ring-inset ring-slate-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <p className="text-sm font-bold text-slate-900">
                {weighted && <span className="mr-1 text-slate-500">{letterOf(index)}.</span>}
                {criterion.label}
                {criterion.weight !== undefined && <span className="ml-1.5 font-semibold text-slate-500">({criterion.weight}%)</span>}
              </p>
              {criterion.description && <p className="text-sm text-slate-500">{criterion.description}</p>}
              {weighted && ratings[criterion.key] ? (
                <span className="tabular text-xs font-semibold text-slate-600">
                  {((ratings[criterion.key] * (criterion.weight ?? 0)) / 100).toFixed(2)} points
                </span>
              ) : null}
            </div>
            <div role="radiogroup" aria-label={`Rating for ${criterion.label}`} className={criterion.levels ? "divide-y divide-slate-100" : "flex flex-wrap gap-1.5 p-3"}>
              {scale.map((value) => {
                const chosen = ratings[criterion.key] === value;
                const sentence = criterion.levels?.[value - 1];
                const pick = () => {
                  setRatings((current) => ({ ...current, [criterion.key]: value }));
                  setError("");
                };
                return sentence ? (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={pick}
                    className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${chosen ? "bg-psu-50" : "hover:bg-slate-50"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`tabular grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ring-1 ring-inset ${
                        chosen ? "bg-psu-700 text-white ring-psu-700" : "bg-white text-slate-600 ring-slate-300"
                      }`}
                    >
                      {value}
                    </span>
                    <span className={chosen ? "font-semibold text-slate-900" : "text-slate-700"}>{sentence}</span>
                  </button>
                ) : (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    aria-label={`${value} out of ${form.scale_max}`}
                    onClick={pick}
                    className={`tabular h-10 w-10 rounded-lg text-sm font-semibold ring-1 ring-inset transition-colors ${
                      chosen ? "bg-psu-700 text-white ring-psu-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {weighted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-psu-50 px-4 py-3 ring-1 ring-inset ring-psu-200">
          <div>
            <p className="text-sm font-bold text-slate-900">OJT grade</p>
            <p className="text-xs text-slate-600">Total points ÷ {form.scale_max} × 50 + 50, from the form's weights</p>
          </div>
          <p className="font-display tabular text-[28px] font-extrabold text-psu-900" aria-live="polite">
            {rated === form.criteria.length && grade ? grade.grade.toFixed(2) : "—"}
            <span className="ml-2 text-sm font-semibold text-slate-600">
              {rated}/{form.criteria.length} rated
            </span>
          </p>
        </div>
      )}

      <fieldset className="space-y-2 rounded-xl px-1">
        <legend className="mb-1 text-sm font-medium text-slate-700">At the end of the internship</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={Boolean(outcome.employ)} onChange={(event) => setOutcome((current) => ({ ...current, employ: event.target.checked }))} className="h-5 w-5 accent-(--role-primary)" />
          We would be pleased to employ this student-trainee in the future
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={Boolean(outcome.improve)} onChange={(event) => setOutcome((current) => ({ ...current, improve: event.target.checked }))} className="h-5 w-5 accent-(--role-primary)" />
          He/She needs to improve his/her performance
        </label>
        <details className="rounded-lg bg-slate-50 px-3 py-2 text-sm" open={(outcome.terminated?.length ?? 0) > 0}>
          <summary className="min-h-9 cursor-pointer py-1 font-semibold text-slate-700">Only if the internship was ended early: why</summary>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {TERMINATION_REASONS.map((reason) => (
              <label key={reason} className="flex min-h-10 items-center gap-2.5 text-slate-800">
                <input type="checkbox" checked={outcome.terminated?.includes(reason) ?? false} onChange={() => toggleReason(reason)} className="h-4 w-4 accent-(--role-primary)" />
                {reason}
              </label>
            ))}
          </div>
        </details>
      </fieldset>

      <div>
        <label htmlFor="final-remarks" className="mb-1.5 block text-sm font-medium text-slate-700">
          Overall remarks
        </label>
        <p className="mb-1.5 text-xs text-slate-500">Please discuss strengths and weaknesses with the student-trainee to encourage and motivate improved performance.</p>
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
