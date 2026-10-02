import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";

type Evaluation = {
  id: number;
  student_id: string;
  evaluator_type: "student" | "supervisor" | "teacher";
  category: string;
  rating: number;
  comments: string | null;
  eval_date: string;
};

const NAV_ITEMS = [
  { label: "Dashboard", path: "/student/dashboard" },
  { label: "Daily Log", path: "/daily-log" },
  { label: "My Tasks", path: "/task" },
  { label: "OJT Schedule", path: "/schedule" },
  { label: "Documents", path: "/documents" },
  { label: "Report Complaint", path: "/report" },
  { label: "Company Feedback", path: "/student/feedback" },
];

export default function StudentFeedback() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("student_id");
    if (!id) {
      navigate("/");
      return;
    }

    setStudentId(id);
    const loadEvaluations = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/evaluations/student/${encodeURIComponent(id)}`,
          withStudentAuth()
        );
        const data = await response.json();
        if (response.status === 401) {
          navigate("/");
          return;
        }
        if (!response.ok) {
          throw new Error(data.message || "Unable to load feedback history.");
        }
        setEvaluations(
          Array.isArray(data.evaluations) ? data.evaluations : []
        );
      } catch (loadError) {
        setHistoryError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to connect to the server."
        );
      } finally {
        setLoading(false);
      }
    };

    void loadEvaluations();
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!rating) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }

    try {
      setSubmitting(true);
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
      const data = await response.json();
      if (response.status === 401) {
        navigate("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "Unable to submit your feedback.");
      }

      setEvaluations((previous) => [data.evaluation, ...previous]);
      setRating(0);
      setComments("");
      setMessage("Your feedback was submitted.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to connect to the server."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 text-white md:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-lg font-bold">INTERNet</p>
            <p className="mt-1 text-xs text-slate-400">OJT Monitoring System</p>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Student navigation">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={item.path === "/student/feedback" ? "page" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  item.path === "/student/feedback"
                    ? "bg-white/10 font-medium text-amber-400"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("student");
              localStorage.removeItem("student_id");
              localStorage.removeItem("student_token");
              navigate("/");
            }}
            className="border-t border-white/10 px-5 py-4 text-left text-sm text-slate-300 hover:text-white"
          >
            Sign out
          </button>
        </aside>

        <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="mb-5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            ← Back to dashboard
          </button>
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Company Feedback</h1>
            <p className="mt-1 text-sm text-slate-500">
              Share your rating and experience from your OJT placement.
            </p>
          </header>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-base font-semibold">Overall training experience</h2>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-slate-700">
                Your rating <span className="text-red-600">*</span>
              </legend>
              <div className="mt-2 flex gap-2" aria-label="Rating from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    aria-pressed={rating === value}
                    className={`text-3xl leading-none ${
                      value <= rating ? "text-amber-400" : "text-slate-300"
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="sr-only">{rating} out of 5 stars selected</span>
              </div>
            </fieldset>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Comments (optional)
              <textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="What went well, and what could improve?"
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="mt-3 text-sm text-emerald-700">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit feedback"}
            </button>
          </form>

          <section className="mt-8" aria-labelledby="feedback-history-heading">
            <h2 id="feedback-history-heading" className="text-lg font-semibold">
              Feedback history
            </h2>
            {loading && (
              <p className="mt-3 text-sm text-slate-500">Loading feedback...</p>
            )}
            {!loading && historyError && evaluations.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                {historyError} Refresh the page to retry.
              </p>
            )}
            {!loading && !historyError && evaluations.length === 0 && (
              <p className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                You have not submitted feedback yet.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {evaluations.map((evaluation) => (
                <article
                  key={evaluation.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{evaluation.category}</h3>
                    <span className="text-amber-500" aria-label={`${evaluation.rating} out of 5 stars`}>
                      {"★".repeat(evaluation.rating)}
                      <span className="text-slate-300">
                        {"★".repeat(Math.max(0, 5 - evaluation.rating))}
                      </span>
                    </span>
                  </div>
                  {evaluation.comments && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                      {evaluation.comments}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(evaluation.eval_date).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
