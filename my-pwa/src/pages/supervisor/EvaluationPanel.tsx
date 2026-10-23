import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  SkeletonRows,
  StarInput,
  Stars,
} from "../../components/ui";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { EVALUATION_CATEGORIES } from "../../lib/evaluation";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import FinalEvaluationCard from "./FinalEvaluationCard";

type Evaluation = {
  id: number;
  evaluator_type: "student" | "supervisor" | "teacher";
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  eval_date?: string | null;
  created_at?: string | null;
  /** True for an evaluation this supervisor wrote, which they may change. */
  mine?: boolean;
};

/**
 * Everything a supervisor writes about one intern's performance: the star
 * ratings, their history, and the final evaluation form. It is the
 * Evaluate tab of the intern's page; the page it used to be,
 * /supervisor/evaluation, now leads here.
 */
export default function EvaluationPanel({ intern }: { intern: { student_id: string; name: string } }) {
  const [category, setCategory] = useState<string>(EVALUATION_CATEGORIES[0]);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The evaluation being changed, when the form is editing instead of adding.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Evaluation | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [history, setHistory] = useState<Evaluation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const chosenIntern = intern;
  const chosen = intern.student_id;

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
    void Promise.resolve().then(() => loadHistory(chosen));
  }, [chosen, loadHistory]);

  // An evaluation of the same thing this supervisor already wrote.
  const existing =
    editingId === null
      ? history.find((item) => item.mine && item.category === category)
      : undefined;

  const summary = useMemo(() => {
    if (history.length === 0) return null;
    const groups = new Map<string, number[]>();
    for (const item of history) {
      groups.set(item.category, [...(groups.get(item.category) || []), Number(item.rating)]);
    }
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      overall: average(history.map((item) => Number(item.rating))),
      categories: [...groups.entries()]
        .map(([name, values]) => ({ name, average: average(values), count: values.length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [history]);

  const resetForm = () => {
    setEditingId(null);
    setRating(0);
    setComments("");
    setError("");
  };

  const startEditing = (item: Evaluation) => {
    setEditingId(item.id);
    setCategory(item.category);
    setRating(Number(item.rating));
    setComments(item.comments || "");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        editingId === null
          ? `${API_URL}/api/evaluations`
          : `${API_URL}/api/evaluations/${editingId}`,
        withSupervisorAuth({
          method: editingId === null ? "POST" : "PUT",
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
      toast.celebrate(
        `Evaluation ${editingId === null ? "saved" : "updated"}. ${chosenIntern.name} has been notified.`
      );
      resetForm();
      await loadHistory(chosen);
    } catch (submitError) {
      setError(errorText(submitError, "The evaluation could not be saved."));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations/${removing.id}`,
        withSupervisorAuth({ method: "DELETE" })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The evaluation could not be removed.");
      toast.success("Evaluation removed.");
      if (editingId === removing.id) resetForm();
      setRemoving(null);
      await loadHistory(chosen);
    } catch (removeError) {
      toast.error(errorText(removeError, "The evaluation could not be removed."));
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Rate {intern.name}'s performance. They and the OJT coordinator can see each evaluation.
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <form onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
            <h2 className="text-[16px] font-bold text-slate-900">
              {editingId === null ? "New evaluation" : "Edit evaluation"}
            </h2>

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
                {/* Keep a category saved under an older label selectable. */}
                {!EVALUATION_CATEGORIES.some((option) => option === category) && (
                  <option>{category}</option>
                )}
                {EVALUATION_CATEGORIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>

            {existing && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <p>
                  You already rated this on {formatDate(existing.eval_date || existing.created_at)}.{" "}
                  <button
                    type="button"
                    onClick={() => startEditing(existing)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Edit that evaluation
                  </button>{" "}
                  instead, or save to add another.
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Rating</p>
              <StarInput value={rating} onChange={setRating} label="Rating from 1 to 5 stars" />
            </div>

            <div>
              <label
                htmlFor="evaluation-comments"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Comments <span className="font-normal text-slate-500">(optional)</span>
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" busy={submitting} doneLabel="Saved" failed={Boolean(error)}>
                {submitting ? "Saving" : editingId === null ? "Save evaluation" : "Save changes"}
              </Button>
              {editingId !== null && (
                <Button variant="secondary" onClick={resetForm} disabled={submitting}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader icon="star"
            title="Past evaluations"
            description={`For ${chosenIntern.name}`}
          />
          <div className="mt-3">
            {historyLoading ? (
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
              <>
                {summary && (
                  <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="tabular text-2xl font-bold tracking-tight text-slate-900">
                        {summary.overall.toFixed(1)}
                      </p>
                      <p className="text-sm text-slate-600">
                        average across {history.length}{" "}
                        {history.length === 1 ? "evaluation" : "evaluations"}
                      </p>
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {summary.categories.map((item) => (
                        <div key={item.name} className="flex items-baseline justify-between gap-3">
                          <dt className="min-w-0 truncate text-slate-600">{item.name}</dt>
                          <dd className="tabular shrink-0 font-medium text-slate-900">
                            {item.average.toFixed(1)}
                            {item.count > 1 && (
                              <span className="font-normal text-slate-500"> · {item.count}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className={`px-4 py-3.5 sm:px-5 ${
                        item.id === editingId ? "bg-psu-50" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                        <Stars value={item.rating} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.mine
                          ? "You"
                          : item.evaluator_name ||
                            (item.evaluator_type === "teacher" ? "OJT coordinator" : "Supervisor")}{" "}
                        · {formatDate(item.eval_date || item.created_at)}
                      </p>
                      {item.comments && (
                        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
                          {item.comments}
                        </p>
                      )}
                      {item.mine && (
                        <div className="mt-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 min-h-11 text-sm font-medium text-psu-700 hover:bg-slate-100"
                          >
                            <Icon name="edit" size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(item)}
                            className="inline-flex items-center rounded-md px-2 min-h-11 text-sm font-medium text-red-600 hover:bg-slate-100"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <FinalEvaluationCard intern={chosenIntern} />
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this evaluation?"
        message={
          removing
            ? `Your ${removing.category} rating for ${chosenIntern.name} will be deleted for them and for the OJT coordinator. This cannot be undone.`
            : undefined
        }
        confirmLabel="Remove"
        cancelLabel="Keep it"
        tone="danger"
        busy={removeBusy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
