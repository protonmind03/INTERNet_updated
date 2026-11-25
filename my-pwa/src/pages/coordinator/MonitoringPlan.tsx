import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { formatDayDate } from "../../lib/format";
import { phStamp } from "../../lib/phTime";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.3: the monitoring plan. Visits, calls and message check-ins,
| planned for a company or one student there. The planner is reminded the
| day before. Marking one done puts it in the visit log with its findings.
| The plan can be exported as a PDF for the OJT office.
*/

type Kind = "visit" | "call" | "message";
type Plan = { id: number; kind: Kind; planned_on: string; plan_note: string | null; company_id: number; company: string; student_id: string | null; student: string | null; planned_by: string };
type Board = {
  today: string;
  week: { start: string; end: string };
  overdue: Plan[];
  this_week: Plan[];
  later: Plan[];
  companies: { id: number; name: string; students: { student_id: string; name: string }[] }[];
};

const KIND_WORDS: Record<Kind, string> = { visit: "Visit", call: "Call", message: "Message check-in" };

type Form = { id: number | null; company_id: string; student_id: string; kind: Kind; planned_on: string; note: string };

export default function MonitoringPlan() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [finishing, setFinishing] = useState<{ plan: Plan; findings: string; follow_up: string; done_on: string } | null>(null);
  const [removing, setRemoving] = useState<Plan | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(await coordinatorRequest<Board>("/api/coordinator/monitoring-plan"));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The monitoring plan could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  /** Runs a change from a dialog, then closes it and reloads. */
  const run = async (path: string, method: "POST" | "PUT" | "DELETE", body: unknown, close: () => void, fallback: string) => {
    setBusy(true);
    setDialogError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(path, { method, body });
      toast.success(data.message);
      close();
      await load();
    } catch (runError) {
      setDialogError(errorText(runError, fallback));
    } finally {
      setBusy(false);
    }
  };

  const savePlan = () => {
    if (!form) return;
    const body = { company_id: Number(form.company_id), student_id: form.student_id || null, kind: form.kind, planned_on: form.planned_on, note: form.note };
    if (form.id === null) void run("/api/coordinator/monitoring-plan", "POST", body, () => setForm(null), "The check-in could not be planned.");
    else void run(`/api/coordinator/monitoring-plan/${form.id}`, "PUT", body, () => setForm(null), "The check-in could not be changed.");
  };

  const exportPdf = async () => {
    if (!board) return;
    try {
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      const head = ["Day", "Kind", "Company", "Student", "Note", "Planned by"];
      const rows = (list: Plan[]) => list.map((plan) => [plan.planned_on, KIND_WORDS[plan.kind], plan.company, plan.student ?? "Whole company", plan.plan_note ?? "", plan.planned_by]);
      buildAnalyticsPdf(
        [
          { title: "Overdue check-ins", head, rows: rows(board.overdue) },
          { title: `Planned this week (${board.week.start} to ${board.week.end})`, head, rows: rows(board.this_week) },
          { title: "Planned after this week", head, rows: rows(board.later) },
        ],
        phStamp(new Date()),
        "INTERNet OJT Monitoring Plan"
      ).save("internet-monitoring-plan.pdf");
    } catch (pdfError) {
      toast.error(errorText(pdfError, "The PDF could not be made."));
    }
  };

  const closeDialogs = () => {
    setForm(null);
    setFinishing(null);
    setRemoving(null);
    setDialogError("");
  };

  const list = (title: string, plans: Plan[], empty: string, overdue = false) => (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">
        {title} ({plans.length})
      </h3>
      {plans.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {plans.map((plan) => (
            <li key={plan.id} className="py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                {formatDayDate(plan.planned_on)}, {plan.company}
                <StatusBadge status={KIND_WORDS[plan.kind]} tone={overdue ? "waiting" : "neutral"} />
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {plan.student ? `About ${plan.student}` : "Whole company"}
                {plan.plan_note ? `. ${plan.plan_note}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setFinishing({ plan, findings: "", follow_up: "", done_on: board!.today })}>
                  Mark done<span className="sr-only">: {plan.company}, {plan.planned_on}</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setForm({ id: plan.id, company_id: String(plan.company_id), student_id: plan.student_id ?? "", kind: plan.kind, planned_on: plan.planned_on < board!.today ? board!.today : plan.planned_on, note: plan.plan_note ?? "" })}
                >
                  Move<span className="sr-only">: {plan.company}, {plan.planned_on}</span>
                </Button>
                <Button variant="secondary" onClick={() => setRemoving(plan)}>
                  Remove<span className="sr-only">: {plan.company}, {plan.planned_on}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const company = board?.companies.find((item) => String(item.id) === form?.company_id);

  return (
    <Card>
      <CardHeader
        icon="calendar"
        title="Monitoring plan"
        description="Visits, calls and message check-ins. You are reminded the day before."
      />
      <div className="space-y-5 px-4 pb-5 pt-3 sm:px-5">
        {board && (
          <div className="flex flex-wrap gap-2">
            <Button
              icon="plus"
              disabled={board.companies.length === 0}
              onClick={() => setForm({ id: null, company_id: String(board.companies[0]?.id ?? ""), student_id: "", kind: "visit", planned_on: board.today, note: "" })}
            >
              Plan a check-in
            </Button>
            <Button variant="secondary" icon="download" onClick={() => void exportPdf()}>
              Export the plan
            </Button>
          </div>
        )}
        {error ? (
          <ErrorNotice message={error} onRetry={() => void load()} />
        ) : board === null ? (
          <SkeletonRows rows={2} />
        ) : (
          <>
            {board.overdue.length > 0 && list("Overdue check-ins", board.overdue, "", true)}
            {list("Planned this week", board.this_week, "Nothing planned for the rest of this week.")}
            {board.later.length > 0 && <p className="text-sm text-slate-600">{board.later.length} more planned after this week. They are in the export.</p>}
          </>
        )}
      </div>

      <ConfirmDialog
        open={form !== null}
        title={form?.id === null ? "Plan a check-in" : "Move the check-in"}
        confirmLabel={form?.id === null ? "Plan it" : "Save"}
        busy={busy}
        onConfirm={savePlan}
        onCancel={closeDialogs}
      >
        {form && board && (
          <div className="space-y-3">
            {form.id === null && (
              <>
                <FormField label="Company" htmlFor="plan-company">
                  <select id="plan-company" className="field min-h-11" value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value, student_id: "" })}>
                    {board.companies.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="About" htmlFor="plan-student">
                  <select id="plan-student" className="field min-h-11" value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>
                    <option value="">The whole company</option>
                    {(company?.students ?? []).map((student) => (
                      <option key={student.student_id} value={student.student_id}>{student.name}</option>
                    ))}
                  </select>
                </FormField>
              </>
            )}
            <FormField label="Kind" htmlFor="plan-kind">
              <select id="plan-kind" className="field min-h-11" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Kind })}>
                {(Object.keys(KIND_WORDS) as Kind[]).map((kind) => (
                  <option key={kind} value={kind}>{KIND_WORDS[kind]}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Day" htmlFor="plan-day">
              <input id="plan-day" type="date" className="field min-h-11" min={board.today} value={form.planned_on} onChange={(event) => setForm({ ...form, planned_on: event.target.value })} />
            </FormField>
            <FormField label="What to look at" htmlFor="plan-note" optional>
              <input id="plan-note" className="field min-h-11" maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </FormField>
            <FormError message={dialogError} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={finishing !== null}
        title={finishing ? `Mark done: ${finishing.plan.company}` : ""}
        message="It goes into the visit log with what you found."
        confirmLabel="Mark done"
        busy={busy}
        onConfirm={() =>
          finishing &&
          void run(
            `/api/coordinator/monitoring-plan/${finishing.plan.id}/done`,
            "POST",
            { findings: finishing.findings, follow_up: finishing.follow_up, done_on: finishing.done_on },
            () => setFinishing(null),
            "The check-in could not be marked done."
          )
        }
        onCancel={closeDialogs}
      >
        {finishing && board && (
          <div className="space-y-3">
            <FormField label="What you found" htmlFor="done-findings">
              <textarea id="done-findings" className="field min-h-20" maxLength={3000} value={finishing.findings} onChange={(event) => setFinishing({ ...finishing, findings: event.target.value })} />
            </FormField>
            <FormField label="Follow-up" htmlFor="done-follow-up" optional>
              <input id="done-follow-up" className="field min-h-11" maxLength={1000} value={finishing.follow_up} onChange={(event) => setFinishing({ ...finishing, follow_up: event.target.value })} />
            </FormField>
            <FormField label="Done on" htmlFor="done-on">
              <input id="done-on" type="date" className="field min-h-11" max={board.today} value={finishing.done_on} onChange={(event) => setFinishing({ ...finishing, done_on: event.target.value })} />
            </FormField>
            <FormError message={dialogError} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove the check-in at ${removing.company}?` : ""}
        message="It is taken off the plan."
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onConfirm={() => removing && void run(`/api/coordinator/site-visits/${removing.id}`, "DELETE", undefined, () => setRemoving(null), "The check-in could not be removed.")}
        onCancel={closeDialogs}
      >
        <FormError message={dialogError} />
      </ConfirmDialog>
    </Card>
  );
}
