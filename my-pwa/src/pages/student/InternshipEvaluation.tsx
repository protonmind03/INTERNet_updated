import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FinalEvaluationView from "../../components/FinalEvaluationView";
import Icon from "../../components/Icon";
import { Button, Card, CardHeader, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import FormButtons, { FormPreview } from "./forms/FormButtons";
import { fileNameFor } from "./forms/formModel";
import { FEEDBACK, feedbackBlocks } from "./forms/recordForms";
import { usePrintFields } from "./forms/useFormData";
import { formatDate, formatLongDate } from "../../lib/format";
import { phDateKey, phToday } from "../../lib/phTime";
import { API_URL, withStudentAuth } from "../../lib/api";
import { useAccount } from "../../lib/session";
import { useFinalEvaluation } from "../../lib/useFinalEvaluation";
import { restoreAutosave, saveStateText, useAutosave } from "../../lib/useAutosave";
import { FEEDBACK_CHOICES, FEEDBACK_CRITERIA, traineeRecord, type FeedbackForm } from "../../lib/traineeRecord";
import { useTimeRecordHeader } from "../../lib/timeRecordHeader";
import { toast } from "../../lib/toast";
import SubTabs from "./SubTabs";
import { useTimeIn } from "./timeInContext";
import { logDateKey } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| INTERNSHIP EVALUATION (Resolution Center, revisions November 2026)
|--------------------------------------------------------------------------
|
| Two sides of the end of the internship, as the PSU forms have them:
|
|   Your feedback   the Student-Intern's Feedback Form (FM-AA-INT-20): the
|                   seven statements rated Strongly Agree to Strongly
|                   Disagree, the problems met and other concerns. It saves
|                   as the trainee goes; Submit marks it done once every
|                   statement is rated. Beside the questions, the form
|                   as the university prints it, filling in as they
|                   answer; Print and Save (PDF or Word) give that form,
|                   for the narrative report (forms/recordForms.ts).
|
|   Supervisor's    the Internship Evaluation Form (FM-AA-INT-13) the
|   evaluation      supervisor fills in at the end, read-only, with the OJT
|                   grade when the form is weighted.
|
*/

type Side = "feedback" | "supervisor";

export default function InternshipEvaluation() {
  const [params, setParams] = useSearchParams();
  const side: Side = params.get("side") === "supervisor" ? "supervisor" : "feedback";
  const setSide = (next: Side) => {
    const rest = new URLSearchParams(params);
    if (next === "supervisor") rest.set("side", "supervisor");
    else rest.delete("side");
    setParams(rest, { replace: true });
  };
  return (
    <div>
      <SubTabs
        label="Internship evaluation"
        idPrefix="evaluation-side"
        value={side}
        onChange={setSide}
        options={[
          { value: "feedback", label: "Your feedback form", short: "Your form", icon: "edit" },
          { value: "supervisor", label: "Supervisor's evaluation", short: "Supervisor's", icon: "star" },
        ]}
      />
      <div id="evaluation-side-panel" role="tabpanel" aria-labelledby={`evaluation-side-${side}`}>
        {side === "feedback" ? <FeedbackFormPanel /> : <SupervisorEvaluationPanel />}
      </div>
    </div>
  );
}

type Draft = { ratings: Record<string, number>; problems_met: string; other_concerns: string };

function FeedbackFormPanel() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const header = useTimeRecordHeader("student", studentId, null);
  const [loaded, setLoaded] = useState<FeedbackForm | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>({ ratings: {}, problems_met: "", other_concerns: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [department, setDepartment] = useState("");
  const sheet = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const { form } = await traineeRecord.feedbackForm("student", studentId);
      const waiting = await restoreAutosave<Draft>("student", `feedback-form:${studentId}`);
      setDraft(
        waiting ?? {
          ratings: form?.ratings ?? {},
          problems_met: form?.problems_met ?? "",
          other_concerns: form?.other_concerns ?? "",
        }
      );
      setLoaded(form);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your feedback form.");
      setLoaded(null);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The department the trainee works in, for the form's head.
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    fetch(`${API_URL}/api/company/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => active && data?.company?.department && setDepartment(String(data.company.department)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [studentId]);

  const autosave = useAutosave<Draft>({
    role: "student",
    key: studentId ? `feedback-form:${studentId}` : null,
    value: draft,
    enabled: loaded !== undefined,
    save: async (value) => {
      if (!studentId) return;
      const { form } = await traineeRecord.saveFeedbackForm(studentId, value);
      setLoaded(form);
    },
  });

  const rated = FEEDBACK_CRITERIA.filter((criterion) => draft.ratings[criterion.key]).length;
  const complete = rated === FEEDBACK_CRITERIA.length;
  const submittedAt = loaded?.submitted_at ?? null;

  const submit = async () => {
    if (!studentId || !complete) return;
    setSubmitting(true);
    try {
      const { form } = await traineeRecord.saveFeedbackForm(studentId, { ...draft, submit: true });
      setLoaded(form);
      toast.success("Your feedback form was submitted.");
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "The form could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const rate = (key: string, value: number) => setDraft((current) => ({ ...current, ratings: { ...current.ratings, [key]: value } }));

  if (loaded === undefined) return <SkeletonRows rows={5} />;

  const company = header?.trainee.company ?? student?.company ?? "";
  const course = header?.trainee.program ?? student?.program ?? "";

  const name = header?.trainee.name ?? student?.name ?? "";
  const blocks = feedbackBlocks({
    name,
    course,
    department,
    company,
    ratings: draft.ratings,
    problems: draft.problems_met,
    concerns: draft.other_concerns,
    date: submittedAt ? phDateKey(submittedAt) : phToday(),
  });
  const campus = header?.institution.campus_name || undefined;

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}

      <Card>
        <CardHeader
          icon="clipboard"
          title="Student-Intern's Feedback Form"
          description="PSU form FM-AA-INT-20. How your training went, in your own words. Your coordinator reads it."
        />
        <div className="border-t border-(--role-hairline) px-4 py-3 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {submittedAt ? (
              <StatusBadge status={`Submitted ${formatDate(submittedAt)}`} tone="good" />
            ) : (
              <StatusBadge status={`${rated} of ${FEEDBACK_CRITERIA.length} rated`} tone={complete ? "info" : "neutral"} />
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-psu-600 transition-[width] duration-300" style={{ width: `${(rated / FEEDBACK_CRITERIA.length) * 100}%` }} />
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Name of student-intern", name],
              ["Course", course],
              ["Department", department || "—"],
              ["Company name", company || "—"],
            ].map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{term}</dt>
                <dd className="truncate font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:items-start">
        <div className="space-y-4">
          <Card>
            <ol className="divide-y divide-(--role-hairline)">
              {FEEDBACK_CRITERIA.map((criterion, index) => {
                const chosen = draft.ratings[criterion.key];
                return (
                  <li key={criterion.key} className="px-4 py-4 sm:px-5">
                    <p id={`criterion-${criterion.key}`} className="flex gap-2.5 text-[15px] font-semibold leading-snug text-slate-900">
                      <span
                        aria-hidden="true"
                        className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${chosen ? "bg-psu-700 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        {chosen ? <Icon name="check" size={13} /> : index + 1}
                      </span>
                      {criterion.text}
                    </p>
                    <div role="radiogroup" aria-labelledby={`criterion-${criterion.key}`} className="mt-3 grid grid-cols-5 overflow-hidden rounded-xl ring-1 ring-inset ring-(--role-hairline)">
                      {FEEDBACK_CHOICES.map((choice, position) => {
                        const on = chosen === choice.value;
                        return (
                          <button
                            key={choice.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={choice.label}
                            onClick={() => rate(criterion.key, choice.value)}
                            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition-colors sm:text-[12px] ${
                              position > 0 ? "border-l border-(--role-hairline)" : ""
                            } ${on ? "bg-psu-700 text-white" : "bg-white text-slate-600 hover:bg-psu-50"}`}
                          >
                            <span className={`tabular text-[13px] font-extrabold ${on ? "text-gold-200" : "text-slate-400"}`}>{choice.value}</span>
                            <span className="sm:hidden">{choice.short}</span>
                            <span className="hidden sm:inline">{choice.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-1">
            {(
              [
                ["problems_met", "Problems met", "What made your training harder, if anything."],
                ["other_concerns", "Other concerns", "Anything else your coordinator should know."],
              ] as const
            ).map(([field, title, hint]) => (
              <Card key={field} className="p-4 sm:p-5">
                <label htmlFor={`feedback-${field}`} className="block text-[15px] font-bold text-slate-900">
                  {title}
                </label>
                <p className="mt-0.5 text-[13px] text-slate-600">{hint} Optional.</p>
                <textarea
                  id={`feedback-${field}`}
                  rows={5}
                  maxLength={3000}
                  value={draft[field]}
                  onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                  className="field mt-2.5 resize-y"
                />
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13.5px] text-slate-600" aria-live="polite">
              {saveStateText(autosave.state, autosave.message) ||
                (submittedAt ? `Submitted ${formatLongDate(submittedAt)}. You can still change it; changes save by themselves.` : "Your answers save by themselves as you go.")}
            </p>
            {!submittedAt && (
              <Button icon="check" busy={submitting} disabled={!complete} onClick={() => void submit()} className="shrink-0">
                {complete ? "Submit form" : `Rate all ${FEEDBACK_CRITERIA.length} to submit`}
              </Button>
            )}
          </div>
        </div>

        <section aria-labelledby="feedback-paper" className="space-y-3 2xl:sticky 2xl:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="feedback-paper" className="text-[15px] font-extrabold text-slate-900">
                The form, as printed
              </h3>
              <p className="text-[12.5px] text-slate-600">Fills in as you answer. Sign it once printed.</p>
            </div>
            <FormButtons meta={FEEDBACK} blocks={blocks} sheet={sheet} campus={campus} fileName={fileNameFor(FEEDBACK, name)} />
          </div>
          <FormPreview meta={FEEDBACK} blocks={blocks} sheet={sheet} campus={campus} label="Preview of the feedback form" />
        </section>
      </div>
    </div>
  );
}

function SupervisorEvaluationPanel() {
  const student = useAccount("student");
  const final = useFinalEvaluation("student", student?.student_id);
  const header = useTimeRecordHeader("student", student?.student_id, null);
  const { attendance } = useTimeIn();
  const { fields } = usePrintFields();
  const evaluation = final.evaluation;
  const worked = attendance.logs.filter((log) => log.time_in).map(logDateKey).sort();
  if (!final.loaded) return <SkeletonRows rows={4} />;
  if (!evaluation) {
    return (
      <Card>
        <EmptyState
          icon="star"
          title="Not evaluated yet"
          description="Your supervisor fills in the Internship Evaluation Form (FM-AA-INT-13) near the end of your hours. It will appear here, with your OJT grade."
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        icon="star"
        title="Internship Evaluation Form"
        description="PSU form FM-AA-INT-13, filled in by your supervisor"
      />
      <div className="border-t border-(--role-hairline) px-4 py-4 sm:px-5">
        <FinalEvaluationView
          evaluation={evaluation}
          printable={{
            name: header?.trainee.name ?? student?.name ?? "",
            company: header?.trainee.company ?? student?.company ?? "",
            companyAddress: fields?.companyAddress ?? "",
            hours: header?.trainee.required_hours ? String(header.trainee.required_hours) : undefined,
            started: worked[0],
            ended: worked[worked.length - 1],
            campus: header?.institution.campus_name,
          }}
        />
      </div>
    </Card>
  );
}
