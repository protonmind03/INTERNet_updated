import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  SkeletonRows,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

type Evaluation = {
  id: number;
  evaluator_type: "student" | "supervisor" | "teacher";
  evaluator_name?: string | null;
  category: string;
  rating: number;
  comments: string | null;
  eval_date?: string | null;
  created_at?: string | null;
};

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export default function StudentFeedback() {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comments, setComments] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations/student/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load evaluations.");
      setEvaluations(Array.isArray(data.evaluations) ? data.evaluations : []);
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error, "Could not load evaluations."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  // The same list holds both directions: evaluations written about the
  // student, and the student's own feedback about the company.
  const received = evaluations.filter((item) => item.evaluator_type !== "student");
  const given = evaluations.filter((item) => item.evaluator_type === "student");
  const average =
    received.length > 0
      ? received.reduce((sum, item) => sum + Number(item.rating), 0) / received.length
      : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) return;
    if (!rating) {
      setFormError("Choose a rating from 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations`,
        withStudentAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            category: "Overall Training Experience",
            rating,
            comments: comments.trim() || null,
          }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your feedback could not be sent.");
      toast.success("Thank you. Your feedback was sent to your coordinator.");
      setRating(0);
      setComments("");
      await load();
    } catch (error) {
      setFormError(errorText(error, "Your feedback could not be sent."));
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hovered || rating;

  return (
    <StudentLayout
      title="Feedback"
      subtitle="See how you were evaluated, and rate your training experience."
    >
      <div className="space-y-5">
        {loadError && <ErrorNotice message={loadError} onRetry={() => void load()} />}

        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title="Evaluations of your performance"
              description="From your supervisor and OJT coordinator"
              action={
                average !== null ? (
                  <p className="flex items-center gap-1.5 text-sm text-slate-600">
                    <Icon name="star" size={16} className="fill-gold-400 text-gold-500" />
                    <span className="font-semibold text-slate-900">
                      {average.toFixed(1)}
                    </span>
                    average
                  </p>
                ) : undefined
              }
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={3} />
              ) : received.length === 0 ? (
                <EmptyState
                  icon="star"
                  title="No evaluations yet"
                  description="Evaluations from your supervisor will appear here."
                />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {received.map((item) => (
                    <EvaluationRow key={item.id} evaluation={item} showEvaluator />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <div className="space-y-5 lg:col-span-2">
            <Card>
              <form onSubmit={submit} className="p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-slate-900">
                  Rate your training experience
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Your coordinator uses this to assess partner companies.
                </p>

                <div
                  className="mt-4 flex items-center gap-1"
                  role="radiogroup"
                  aria-label="Rating from 1 to 5 stars"
                  onMouseLeave={() => setHovered(0)}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} ${value === 1 ? "star" : "stars"}, ${RATING_WORDS[value]}`}
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHovered(value)}
                      className="rounded-md p-1"
                    >
                      <Icon
                        name="star"
                        size={30}
                        className={
                          value <= shown
                            ? "fill-gold-400 text-gold-500"
                            : "text-slate-300"
                        }
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-medium text-slate-700">
                    {RATING_WORDS[shown]}
                  </span>
                </div>

                <label
                  htmlFor="feedback-comments"
                  className="mb-1.5 mt-4 block text-sm font-medium text-slate-700"
                >
                  Comments <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="feedback-comments"
                  rows={4}
                  maxLength={2000}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="What went well, and what could be better?"
                  className="field resize-none"
                />

                {formError && (
                  <p role="alert" className="mt-3 text-sm text-red-600">
                    {formError}
                  </p>
                )}

                <Button type="submit" busy={submitting} className="mt-4">
                  {submitting ? "Sending" : "Send feedback"}
                </Button>
              </form>
            </Card>

            {!loading && given.length > 0 && (
              <Card>
                <CardHeader title="Feedback you sent" />
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                  {given.map((item) => (
                    <EvaluationRow key={item.id} evaluation={item} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}

function EvaluationRow({
  evaluation,
  showEvaluator = false,
}: {
  evaluation: Evaluation;
  showEvaluator?: boolean;
}) {
  const stars = Math.max(0, Math.min(5, Math.round(Number(evaluation.rating))));
  const who =
    evaluation.evaluator_name ||
    (evaluation.evaluator_type === "teacher" ? "OJT coordinator" : "Supervisor");
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{evaluation.category}</p>
        <span
          className="flex items-center gap-0.5"
          role="img"
          aria-label={`${stars} out of 5 stars`}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <Icon
              key={value}
              name="star"
              size={15}
              className={value <= stars ? "fill-gold-400 text-gold-500" : "text-slate-300"}
            />
          ))}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {showEvaluator && `${who} · `}
        {formatDate(evaluation.eval_date || evaluation.created_at)}
      </p>
      {evaluation.comments && (
        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
          {evaluation.comments}
        </p>
      )}
    </li>
  );
}
