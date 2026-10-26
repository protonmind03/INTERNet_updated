import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Card, EmptyState, ProgressRing, SkeletonRows } from "../../components/ui";
import { formatHours, getInitials } from "../../lib/format";
import { sameId } from "../../lib/ids";
import { FINAL_DUE_WITHIN_HOURS, finalEvaluationPath, nearlyDone } from "./finalDue";
import type { Intern } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| FINAL EVALUATIONS (Review › Final evaluations; sv10-26)
|--------------------------------------------------------------------------
|
| Every intern and where their final evaluation stands, not only the ones
| due: Due now (within FINAL_DUE_WITHIN_HOURS of their hours, none yet),
| Submitted, and Not yet (with how far there is to go). Each row opens that
| intern's Evaluate tab, where the form is.
|
*/

type Stage = "due" | "done" | "later";

const STAGE: Record<Stage, { label: string; tone: string; action: string }> = {
  due: { label: "Due now", tone: "bg-amber-50 text-amber-900 ring-amber-200", action: "Start" },
  done: { label: "Submitted", tone: "bg-emerald-50 text-emerald-900 ring-emerald-200", action: "View" },
  later: { label: "Not yet", tone: "bg-slate-50 text-slate-700 ring-slate-200", action: "Open" },
};

export default function FinalEvaluations({ interns, evaluated, loading }: { interns: Intern[]; evaluated: Set<string> | null; loading: boolean }) {
  if (loading || !evaluated) {
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  }
  if (interns.length === 0) {
    return (
      <Card>
        <EmptyState icon="star" title="No interns yet" description="Final evaluations are written for the interns assigned to you." />
      </Card>
    );
  }
  const stageOf = (intern: Intern): Stage =>
    [...evaluated].some((id) => sameId(id, intern.student_id)) ? "done" : nearlyDone(intern) ? "due" : "later";
  const order: Stage[] = ["due", "later", "done"];
  const rows = [...interns].sort((a, b) => order.indexOf(stageOf(a)) - order.indexOf(stageOf(b)) || b.completion - a.completion);
  const count = (stage: Stage) => interns.filter((intern) => stageOf(intern) === stage).length;

  return (
    <section aria-labelledby="final-title" className="overflow-hidden rounded-2xl border border-(--role-hairline) bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-(--role-hairline) bg-psu-50/40 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-psu-700 text-white">
          <Icon name="star" size={18} />
        </span>
        <h2 id="final-title" className="font-display text-[22px] font-extrabold text-slate-900">
          Final evaluations
        </h2>
        <p className="text-[13.5px] text-slate-600">Asked for when an intern is within {FINAL_DUE_WITHIN_HOURS} h of their requirement.</p>
        <ul className="ml-auto flex flex-wrap gap-2" aria-label="Where they stand">
          {order.map((stage) => (
            <li key={stage} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ring-1 ring-inset ${STAGE[stage].tone}`}>
              <span className="tabular">{count(stage)}</span> {STAGE[stage].label.toLowerCase()}
            </li>
          ))}
        </ul>
      </div>
      <ul className="divide-y divide-(--role-hairline)">
        {rows.map((intern) => {
          const stage = stageOf(intern);
          const left = Math.max(0, (Number(intern.required_hours) || 0) - (Number(intern.hours_rendered) || 0));
          return (
            <li key={intern.student_id} className="flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-psu-50/30">
              <ProgressRing value={intern.completion} size={52} stroke={5} label={`${intern.completion} percent of required hours`}>
                <span aria-hidden="true" className="text-[12px] font-extrabold text-psu-800">
                  {getInitials(intern.name)}
                </span>
              </ProgressRing>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-slate-900">{intern.name}</span>
                <span className="block text-[13px] text-slate-600">
                  {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)}
                  {stage === "later" && left > 0 ? ` · ${formatHours(left)} to go` : ""}
                  {intern.program_code || intern.program ? ` · ${intern.block_name || intern.program_code || intern.program}` : ""}
                </span>
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold ring-1 ring-inset ${STAGE[stage].tone}`}>
                {stage === "done" && <Icon name="check" size={13} />}
                {STAGE[stage].label}
              </span>
              <Link
                to={finalEvaluationPath(intern.student_id)}
                className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold ${
                  stage === "due" ? "bg-psu-600 text-white hover:bg-psu-700" : "text-psu-700 ring-1 ring-inset ring-psu-200 hover:bg-psu-50"
                }`}
              >
                {STAGE[stage].action}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
