import { formatLongDate } from "../lib/format";
import type { FinalEvaluation } from "../lib/useFinalEvaluation";

/**
 * A submitted final evaluation: each criterion with its rating, the
 * average, and the supervisor's remarks. Shown to the student, their
 * supervisor and the coordinator. The criteria are the ones on the form
 * when it was submitted.
 */
export default function FinalEvaluationView({ evaluation }: { evaluation: FinalEvaluation }) {
  const { criteria, scale_max: scale } = evaluation.form_snapshot;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-slate-600">
          By {evaluation.supervisor_name} · {formatLongDate(evaluation.submitted_at)}
        </p>
        <p className="tabular text-sm font-semibold text-slate-900">
          Average {evaluation.average} out of {scale}
        </p>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-xs text-slate-500">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Criterion
            </th>
            <th scope="col" className="w-24 py-2 text-right font-semibold">
              Rating
            </th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion) => (
            <tr key={criterion.key} className="border-b border-slate-100">
              <td className="py-2 pr-3 text-slate-800">{criterion.label}</td>
              <td className="tabular py-2 text-right font-medium text-slate-900">
                {evaluation.ratings[criterion.key] ?? "—"} of {scale}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <p className="text-xs font-medium text-slate-500">Supervisor's remarks</p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">
          {evaluation.remarks}
        </p>
      </div>
    </div>
  );
}
