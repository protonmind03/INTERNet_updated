import { formatDate, formatLongDate } from "../lib/format";
import { TERMINATION_REASONS, isWeighted, letterOf, ojtGrade } from "../lib/ojtGrade";
import { PSU_FORMS } from "../lib/psuForms";
import type { FinalEvaluation } from "../lib/useFinalEvaluation";
import PsuFormSheet, { FormField } from "./PsuFormSheet";

/**
 * A submitted final evaluation: each criterion with its rating, and the
 * supervisor's remarks. Shown to the student, their supervisor and the
 * coordinator, on the criteria of the form as it was when submitted.
 *
 * On a weighted form (PSU's FM-AA-INT-13, November 2026) each competency
 * also shows its weight, the sentence chosen and its points, and the OJT
 * grade leads; the boxes at the foot of the form follow the remarks. With
 * `printable`, printing the page gives the university's form, filled in.
 */
export default function FinalEvaluationView({
  evaluation,
  printable,
}: {
  evaluation: FinalEvaluation;
  /** The trainee and placement, for the printed form's head. */
  printable?: { name: string; company: string; started?: string; ended?: string; campus?: string };
}) {
  const { criteria, scale_max: scale } = evaluation.form_snapshot;
  const weighted = isWeighted(criteria);
  const graded = evaluation.grade ?? ojtGrade(criteria, evaluation.ratings, scale)?.grade ?? null;
  const points = ojtGrade(criteria, evaluation.ratings, scale)?.points ?? null;
  const outcome = evaluation.outcome ?? {};

  return (
    <>
      <div className="space-y-4 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-slate-600">
            By {evaluation.supervisor_name} · {formatLongDate(evaluation.submitted_at)}
          </p>
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

      {printable && (
        <PsuFormSheet title="Internship Evaluation Form" form={PSU_FORMS.evaluation} campus={printable.campus}>
          <table>
            <tbody>
              <tr>
                <td colSpan={2} style={{ textAlign: "center", fontSize: "9.5pt" }}>
                  This form is to be completed by the host company or a designated supervisor, and submitted to the Campus Internship Coordinator and
                  Internship / Practicum Subject Instructor upon completion of the training hours.
                </td>
              </tr>
              <FormField label="Name of student-intern">{printable.name}</FormField>
              <FormField label="Name of company / firm / agency">{printable.company}</FormField>
              <FormField label="Date started · date ended">
                {printable.started ? formatDate(printable.started) : ""} · {printable.ended ? formatDate(printable.ended) : ""}
              </FormField>
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th style={{ width: "22%", textAlign: "center" }}>COMPETENCY</th>
                <th style={{ textAlign: "center" }}>CRITERIA</th>
                <th style={{ width: "8%", textAlign: "center" }}>RATING</th>
                <th style={{ width: "10%", textAlign: "center" }}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion, index) =>
                Array.from({ length: scale }, (_, step) => scale - step).map((value, row) => {
                  const chosen = evaluation.ratings[criterion.key] === value;
                  return (
                    <tr key={`${criterion.key}-${value}`} style={{ breakInside: "avoid" }}>
                      {row === 0 && (
                        <td rowSpan={scale} style={{ verticalAlign: "middle", fontWeight: 700 }}>
                          {letterOf(index)}. {criterion.label.toUpperCase()}
                          {criterion.weight !== undefined ? ` (${criterion.weight}%)` : ""}
                        </td>
                      )}
                      <td style={{ fontSize: "9pt" }}>{criterion.levels?.[value - 1] ?? ""}</td>
                      <td style={{ textAlign: "center", fontWeight: chosen ? 800 : 400 }}>{chosen ? `(${value})` : value}</td>
                      {row === 0 && (
                        <td rowSpan={scale} style={{ verticalAlign: "middle", textAlign: "center" }}>
                          {evaluation.ratings[criterion.key] && criterion.weight !== undefined
                            ? ((evaluation.ratings[criterion.key] * criterion.weight) / 100).toFixed(1)
                            : ""}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              <tr>
                <td colSpan={3} style={{ textAlign: "center", fontWeight: 700 }}>
                  OJT GRADE
                  <br />
                  <span style={{ fontWeight: 400 }}>= Total Points (A + B + … x 10) / 50 x 50 + 50</span>
                </td>
                <td style={{ textAlign: "center", fontSize: "14pt", fontWeight: 800 }}>{graded !== null ? Number(graded).toFixed(2) : ""}</td>
              </tr>
            </tbody>
          </table>
          <section className="psu-form-box" style={{ minHeight: "auto" }}>
            <h3>The Internship Practicum was terminated:</h3>
            <p style={{ columns: 2, fontSize: "9.5pt" }}>
              {TERMINATION_REASONS.map((reason) => (
                <span key={reason} style={{ display: "block" }}>
                  {outcome.terminated?.includes(reason) ? "☒" : "☐"} {reason}
                </span>
              ))}
            </p>
            <p>{outcome.employ ? "☒" : "☐"} We would be pleased to employ this Student-Trainee in the future</p>
            <p>{outcome.improve ? "☒" : "☐"} He/She needs to improve his/her performance.</p>
          </section>
          <section className="psu-form-sign">
            <span className="psu-form-line">{evaluation.supervisor_name}</span>
            <br />
            <i>Printed Name and Signature of Person Completing</i>
            <br />
            Date: <span className="psu-form-line">{formatDate(evaluation.submitted_at)}</span>
          </section>
        </PsuFormSheet>
      )}
    </>
  );
}
