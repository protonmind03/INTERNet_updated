import { formatLongDate } from "../lib/format";
import { isWeighted, letterOf, ojtGrade } from "../lib/ojtGrade";
import type { FinalEvaluation } from "../lib/useFinalEvaluation";
import FormButtons from "../pages/student/forms/FormButtons";
import { fileNameFor } from "../pages/student/forms/formModel";
import { EVALUATION, evaluationBlocks } from "../pages/student/forms/recordForms";

/**
 * A submitted final evaluation: each criterion with its rating, and the
 * supervisor's remarks. Shown to the student, their supervisor and the
 * coordinator, on the criteria of the form as it was when submitted.
 *
 * On a weighted form (PSU's FM-AA-INT-13, November 2026) each competency
 * also shows its weight, the sentence chosen and its points, and the OJT
 * grade leads; the boxes at the foot of the form follow the remarks. With
 * `printable`, Print and Save (PDF or Word) give the university's form,
 * FM-AA-INT-13, filled in (pages/student/forms/recordForms.ts).
 */
export default function FinalEvaluationView({
  evaluation,
  printable,
}: {
  evaluation: FinalEvaluation;
  /** The trainee and placement, for the printed form's head. */
  printable?: { name: string; company?: string; companyAddress?: string; started?: string; ended?: string; hours?: string; campus?: string };
}) {
  const { criteria, scale_max: scale } = evaluation.form_snapshot;
  const weighted = isWeighted(criteria);
  const graded = evaluation.grade ?? ojtGrade(criteria, evaluation.ratings, scale)?.grade ?? null;
  const points = ojtGrade(criteria, evaluation.ratings, scale)?.points ?? null;
  const outcome = evaluation.outcome ?? {};

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-slate-600">
            By {evaluation.supervisor_name} · {formatLongDate(evaluation.submitted_at)}
          </p>
          {printable && (
            <div className="w-full sm:order-last sm:w-auto">
              <FormButtons
                size="sm"
                meta={EVALUATION}
                campus={printable.campus || undefined}
                fileName={fileNameFor(EVALUATION, printable.name)}
                blocks={evaluationBlocks({ name: printable.name, company: printable.company ?? "", companyAddress: printable.companyAddress ?? "", started: printable.started, ended: printable.ended, hours: printable.hours, evaluation })}
              />
            </div>
          )}
          {weighted && graded !== null ? (
            <p className="tabular text-sm text-slate-700">
              OJT grade <span className="font-display ml-1 text-[22px] font-extrabold text-slate-900">{Number(graded).toFixed(2)}</span>
            </p>
          ) : (
            <p className="tabular text-sm font-semibold text-slate-900">
              Average {evaluation.average} out of {scale}
            </p>
          )}
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-slate-200 text-xs text-slate-500">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {weighted ? "Competency" : "Criterion"}
              </th>
              <th scope="col" className="w-24 py-2 text-right font-semibold">
                Rating
              </th>
              {weighted && (
                <th scope="col" className="hidden w-20 py-2 text-right font-semibold sm:table-cell">
                  Points
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion, index) => {
              const rating = evaluation.ratings[criterion.key];
              const sentence = rating ? criterion.levels?.[rating - 1] : undefined;
              return (
                <tr key={criterion.key} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 text-slate-800">
                    <span className="font-medium">
                      {weighted && `${letterOf(index)}. `}
                      {criterion.label}
                      {criterion.weight !== undefined && <span className="text-slate-500"> ({criterion.weight}%)</span>}
                    </span>
                    {sentence && <span className="mt-0.5 block text-[13px] text-slate-600">{sentence}</span>}
                  </td>
                  <td className="tabular py-2 text-right font-medium text-slate-900">
                    {rating ?? "—"} of {scale}
                  </td>
                  {weighted && (
                    <td className="tabular hidden py-2 text-right text-slate-700 sm:table-cell">{rating ? ((rating * (criterion.weight ?? 0)) / 100).toFixed(2) : "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {weighted && points !== null && (
            <tfoot>
              <tr className="text-sm">
                <td className="py-2 pr-3 font-semibold text-slate-900">Total points</td>
                <td />
                <td className="tabular hidden py-2 text-right font-semibold text-slate-900 sm:table-cell">{points.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <div>
          <p className="text-xs font-medium text-slate-500">Supervisor's remarks</p>
          <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{evaluation.remarks}</p>
        </div>
        {(outcome.employ || outcome.improve || (outcome.terminated?.length ?? 0) > 0) && (
          <ul className="space-y-1 text-sm text-slate-800">
            {outcome.employ && <li>✓ We would be pleased to employ this student-trainee in the future.</li>}
            {outcome.improve && <li>✓ He/She needs to improve his/her performance.</li>}
            {(outcome.terminated?.length ?? 0) > 0 && <li>The internship was ended early: {outcome.terminated?.join("; ")}.</li>}
          </ul>
        )}
      </div>

    </>
  );
}
