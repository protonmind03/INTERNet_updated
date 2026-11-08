import { useCallback, useEffect, useState } from "react";
import FinalEvaluationView from "../../components/FinalEvaluationView";
import Icon from "../../components/Icon";
import PsuFormSheet, { FormField } from "../../components/PsuFormSheet";
import { PSU_FORMS } from "../../lib/psuForms";
import { Button, Card, CardHeader, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import { formatDate, formatLongDate } from "../../lib/format";
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
|                   statement is rated. Print gives the form as the
|                   university prints it, signed with the trainee's
|                   e-signature line, for the narrative report.
|
|   Supervisor's    the Internship Evaluation Form (FM-AA-INT-13) the
|   evaluation      supervisor fills in at the end, read-only, with the OJT
|                   grade when the form is weighted.
|
*/

type Side = "feedback" | "supervisor";

export default function InternshipEvaluation() {
  const [side, setSide] = useState<Side>("feedback");
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

  return (
    <>
      <div className="space-y-4 print:hidden">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <CardHeader
            icon="clipboard"
            title="Student-Intern's Feedback Form"
            description="PSU form FM-AA-INT-20. How your training went, in your own words. Your coordinator reads it."
            action={
              submittedAt ? (
                <StatusBadge status={`Submitted ${formatDate(submittedAt)}`} tone="good" />
              ) : (
                <StatusBadge status={`${rated} of ${FEEDBACK_CRITERIA.length} rated`} tone={complete ? "info" : "neutral"} />
              )
            }
          />
          <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-(--role-hairline) px-4 py-3 text-[14px] sm:grid-cols-2 sm:px-5">
            {[
              ["Name of student-intern", student?.name ?? ""],
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
        </Card>

        <Card>
          {/* Column names, on a wide screen, over the five choices. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,84px)] items-end gap-1 border-b border-(--role-hairline) px-5 pb-2 pt-4 text-center text-[11.5px] font-bold leading-tight text-slate-600 lg:grid">
            <span className="text-left uppercase tracking-wide">Criteria</span>
            {FEEDBACK_CHOICES.map((choice) => (
              <span key={choice.value}>{choice.label}</span>
            ))}
          </div>
          <ol className="divide-y divide-(--role-hairline)">
            {FEEDBACK_CRITERIA.map((criterion, index) => {
              const chosen = draft.ratings[criterion.key];
              return (
                <li key={criterion.key} className="px-4 py-3.5 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(5,84px)] lg:items-center lg:gap-1 lg:py-2.5">
                  <p id={`criterion-${criterion.key}`} className="flex gap-2 text-[15px] font-semibold leading-snug text-slate-900 lg:font-medium">
                    <span className="tabular shrink-0 text-slate-500">{index + 1}.</span>
                    {criterion.text}
                  </p>
                  <div role="radiogroup" aria-labelledby={`criterion-${criterion.key}`} className="mt-2.5 grid grid-cols-5 gap-1 lg:contents">
                    {FEEDBACK_CHOICES.map((choice) => {
                      const on = chosen === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={choice.label}
                          onClick={() => rate(criterion.key, choice.value)}
                          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10.5px] font-semibold leading-tight ring-1 ring-inset transition-colors lg:mx-auto lg:min-h-11 lg:w-11 lg:rounded-full ${
                            on ? "bg-psu-700 text-white ring-psu-700" : "bg-white text-slate-600 ring-(--role-hairline) hover:bg-psu-50"
                          }`}
                        >
                          <Icon name={on ? "check" : "plus"} size={on ? 18 : 14} className={on ? "" : "text-slate-300 lg:text-slate-300"} />
                          <span className="lg:sr-only">{choice.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
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
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" icon="printer" onClick={() => window.print()}>
              Print form
            </Button>
            {!submittedAt && (
              <Button icon="check" busy={submitting} disabled={!complete} onClick={() => void submit()}>
                {complete ? "Submit form" : `Rate all ${FEEDBACK_CRITERIA.length} to submit`}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* The form as the university prints it. */}
      <PsuFormSheet title="Student-Intern's Feedback Form" form={PSU_FORMS.feedback} campus={header?.institution.campus_name}>
        <table>
          <tbody>
            <FormField label="Name of student-intern">{student?.name}</FormField>
            <FormField label="Course">{course}</FormField>
            <FormField label="Department">{department}</FormField>
            <FormField label="Company name">{company}</FormField>
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th className="text-center">CRITERIA</th>
              {FEEDBACK_CHOICES.map((choice) => (
                <th key={choice.value} className="w-[12%] text-center" style={{ textAlign: "center", fontSize: "9pt" }}>
                  {choice.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEEDBACK_CRITERIA.map((criterion) => (
              <tr key={criterion.key}>
                <td>{criterion.text}</td>
                {FEEDBACK_CHOICES.map((choice) => (
                  <td key={choice.value} className="psu-form-check">
                    {draft.ratings[criterion.key] === choice.value ? "✓" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <section className="psu-form-box">
          <h3>Problems met:</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.problems_met}</p>
        </section>
        <section className="psu-form-box">
          <h3>Other concerns:</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.other_concerns}</p>
        </section>
        <section className="psu-form-sign">
          <span className="psu-form-line">{student?.name}</span>
          <br />
          <i>Signature of Student-Intern</i>
          <br />
          <br />
          Date: <span className="psu-form-line">{submittedAt ? formatLongDate(submittedAt) : ""}</span>
        </section>
      </PsuFormSheet>
    </>
  );
}

function SupervisorEvaluationPanel() {
  const student = useAccount("student");
  const final = useFinalEvaluation("student", student?.student_id);
  const header = useTimeRecordHeader("student", student?.student_id, null);
  const { attendance } = useTimeIn();
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
        action={
          <Button variant="secondary" size="sm" icon="printer" onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <div className="border-t border-(--role-hairline) px-4 py-4 sm:px-5">
        <FinalEvaluationView
          evaluation={evaluation}
          printable={{
            name: header?.trainee.name ?? student?.name ?? "",
            company: header?.trainee.company ?? student?.company ?? "",
            started: worked[0],
            ended: worked[worked.length - 1],
            campus: header?.institution.campus_name,
          }}
        />
      </div>
    </Card>
  );
}
