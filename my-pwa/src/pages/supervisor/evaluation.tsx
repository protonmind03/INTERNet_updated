import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonRows,
  StarInput,
  Stars,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useSupervisorWork } from "./useSupervisorWork";

type Evaluation = {
  id: number;
  evaluator_type: "student" | "supervisor" | "teacher";
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  eval_date?: string | null;
  created_at?: string | null;
};

const CATEGORIES = [
  "Overall Performance",
  "Work Quality",
  "Punctuality & Attendance",
  "Communication Skills",
  "Initiative",
];

export default function SupervisorEvaluation() {
  const supervisor = useAccount("supervisor");
  const { interns, loading: internsLoading } = useSupervisorWork(supervisor?.supervisor_id);

  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState<Evaluation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // With a single intern there is nothing to choose.
  const chosen = studentId || (interns.length === 1 ? interns[0].student_id : "");
  const chosenIntern = interns.find((intern) => intern.student_id === chosen);

  const loadHistory = useCallback(async (id: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations/student/${encodeURIComponent(id)}`,
        withSupervisorAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load past evaluations.");
      setHistory(Array.isArray(data.evaluations) ? data.evaluations : []);
      setHistoryError("");
    } catch (loadError) {
      setHistory([]);
      setHistoryError(errorText(loadError, "Could not load past evaluations."));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chosen) return;
    void Promise.resolve().then(() => loadHistory(chosen));
  }, [chosen, loadHistory]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) {
      setError("Choose the intern you are evaluating.");
      return;
    }
    if (!rating) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations`,
        withSupervisorAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: chosen,
            category,
            rating,
            comments: comments.trim() || null,
          }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The evaluation could not be saved.");
      toast.success(`Evaluation saved. ${chosenIntern?.name || "The intern"} has been notified.`);
      setRating(0);
      setComments("");
      await loadHistory(chosen);
    } catch (submitError) {
      setError(errorText(submitError, "The evaluation could not be saved."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SupervisorLayout
      title="Evaluations"
      subtitle="Rate an intern's performance. They and the OJT coordinator can see each evaluation."
    >
      <div className="grid items-start gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <form onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
            <h2 className="text-sm font-semibold text-slate-900">New evaluation</h2>

            <div>
              <label
                htmlFor="evaluation-intern"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Intern
              </label>
              <select
                id="evaluation-intern"
                value={chosen}
                disabled={internsLoading || interns.length === 0}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setError("");
                }}
                className="field"
              >
                {interns.length !== 1 && (
                  <option value="">
                    {internsLoading
                      ? "Loading interns"
                      : interns.length === 0
                        ? "No interns assigned"
                        : "Choose an intern"}
                  </option>
                )}
                {interns.map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="evaluation-category"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                What are you rating?
              </label>
              <select
                id="evaluation-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="field"
              >
                {CATEGORIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Rating</p>
              <StarInput value={rating} onChange={setRating} label="Rating from 1 to 5 stars" />
            </div>

            <div>
              <label
                htmlFor="evaluation-comments"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Comments <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="evaluation-comments"
                rows={4}
                maxLength={2000}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="What did the intern do well, and what should they work on?"
                className="field resize-none"
              />
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" busy={submitting} disabled={interns.length === 0}>
              {submitting ? "Saving" : "Save evaluation"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Past evaluations"
            description={
              chosenIntern ? `For ${chosenIntern.name}` : "Choose an intern to see their history"
            }
          />
          <div className="mt-3">
            {!chosen ? (
              <EmptyState icon="star" title="No intern selected" />
            ) : historyLoading ? (
              <SkeletonRows rows={3} />
            ) : historyError ? (
              <p role="alert" className="px-5 pb-5 text-sm text-red-700">
                {historyError}
              </p>
            ) : history.length === 0 ? (
              <EmptyState
                icon="star"
                title="No evaluations yet"
                description="The first evaluation you save will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {history.map((item) => (
                  <li key={item.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                      <Stars value={item.rating} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.evaluator_name ||
                        (item.evaluator_type === "teacher" ? "OJT coordinator" : "Supervisor")}{" "}
                      · {formatDate(item.eval_date || item.created_at)}
                    </p>
                    {item.comments && (
                      <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
                        {item.comments}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </SupervisorLayout>
  );
}
