import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";

type EvaluationRow = {
  id: number;
  student_id: string;
  student_name: string | null;
  company: string | null;
  evaluator_type: "supervisor" | "student" | "teacher";
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  eval_date: string;
  created_at: string;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400">
      {"★".repeat(rating)}
      <span className="text-slate-200">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const EVALUATION_CATEGORIES = [
  "Overall OJT Performance",
  "Professionalism & Conduct",
  "Technical Competence",
  "Attendance & Punctuality",
  "Documentation & Reports",
];

type StudentOption = { student_id: string; name: string; company: string | null };

export default function CoordinatorEvaluations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<
    "all" | "supervisor" | "student" | "teacher"
  >("all");
  const [reloadKey, setReloadKey] = useState(0);

  // "Evaluate OJT Performance" (coordinator side of Feature 10)
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formStudent, setFormStudent] = useState("");
  const [formCategory, setFormCategory] = useState(EVALUATION_CATEGORIES[0]);
  const [formRating, setFormRating] = useState(0);
  const [formComments, setFormComments] = useState("");
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/coordinator/students?status=active`,
        withCoordinatorAuth()
      );
      const data = await response.json();
      if (response.ok) setStudents(data.students || []);
    } catch {
      /* the form shows an empty list */
    }
  }, []);


  const submitEvaluation = async () => {
    setFormError("");
    if (!formStudent) {
      setFormError("Select a student.");
      return;
    }
    if (formRating < 1) {
      setFormError("Choose a rating from 1 to 5 stars.");
      return;
    }
    setFormSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/evaluations`,
        withCoordinatorAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: formStudent,
            category: formCategory,
            rating: formRating,
            comments: formComments.trim() || null,
          }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.message || "Failed to submit evaluation.");
        return;
      }
      setFormStudent("");
      setFormRating(0);
      setFormComments("");
      setShowForm(false);
      setReloadKey((key) => key + 1);
    } catch {
      setFormError("Unable to connect to the server.");
    } finally {
      setFormSaving(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/coordinator/evaluations`,
          withCoordinatorAuth()
        );

        if (response.status === 401) {
          navigate("/");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Failed to load evaluations.");
          return;
        }

        setRows(data.evaluations || []);
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, reloadKey]);

  const visible =
    filter === "all" ? rows : rows.filter((r) => r.evaluator_type === filter);

  return (
    <CoordinatorLayout
      title="Evaluations & Feedback"
      subtitle="Supervisor ratings, student feedback, and coordinator evaluations"
      breadcrumb={["Coordinator", "Oversight", "Evaluations"]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          {(
            [
              { key: "all", label: "All" },
              { key: "supervisor", label: "Supervisor → Student" },
              { key: "student", label: "Student → Company" },
              { key: "teacher", label: "Coordinator → Student" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                filter === f.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
          <button
            type="button"
            onClick={() => {
              if (!showForm && students.length === 0) void loadStudents();
              setShowForm((open) => !open);
            }}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Close form" : "Evaluate a student"}
          </button>
        </div>

        {showForm && (
          <div className="space-y-3 rounded-xl border border-indigo-100 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">
              Evaluate overall OJT performance
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={formStudent}
                onChange={(e) => setFormStudent(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.name} ({s.student_id})
                  </option>
                ))}
              </select>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {EVALUATION_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormRating(value)}
                  aria-label={`${value} star${value > 1 ? "s" : ""}`}
                  className={`text-2xl ${
                    value <= formRating ? "text-amber-400" : "text-slate-200"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={formComments}
              onChange={(e) => setFormComments(e.target.value)}
              rows={3}
              placeholder="Comments (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {formError && <p className="text-sm text-red-500">{formError}</p>}
            <button
              type="button"
              onClick={submitEvaluation}
              disabled={formSaving}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {formSaving ? "Submitting…" : "Submit evaluation"}
            </button>
          </div>
        )}

        <div className="space-y-2.5">
          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Loading evaluations...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No evaluations submitted yet.
            </div>
          )}

          {!loading &&
            !error &&
            visible.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {r.category}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.evaluator_type === "supervisor"
                        ? `${r.evaluator_name || "Supervisor"} rated ${r.student_name || r.student_id}`
                        : r.evaluator_type === "teacher"
                          ? `${r.evaluator_name || "Coordinator"} (coordinator) evaluated ${r.student_name || r.student_id}`
                          : `${r.student_name || r.student_id} rated their training at ${r.company || "their company"}`}
                    </p>
                  </div>
                  <Stars rating={r.rating} />
                </div>

                {r.comments && (
                  <p className="mt-2 text-sm text-slate-600">{r.comments}</p>
                )}

                <p className="mt-2 text-xs text-slate-400">
                  {new Date(r.eval_date).toLocaleDateString()}
                </p>
              </div>
            ))}
        </div>
      </div>
    </CoordinatorLayout>
  );
}
