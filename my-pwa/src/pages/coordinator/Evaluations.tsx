import { useCallback, useEffect, useMemo, useState } from "react";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  FormField,
  Modal,
  SkeletonRows,
  StarInput,
  Stars,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { coordinatorRequest } from "./request";

type EvaluatorType = "supervisor" | "student" | "teacher";

type EvaluationRow = {
  id: number;
  student_id: string;
  student_name: string | null;
  company: string | null;
  evaluator_type: EvaluatorType;
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  eval_date: string | null;
  created_at: string;
};

type StudentOption = { student_id: string; name: string; company: string | null };

type Filter = "all" | EvaluatorType;

const CATEGORIES = [
  "Overall OJT Performance",
  "Professionalism & Conduct",
  "Technical Competence",
  "Attendance & Punctuality",
  "Documentation & Reports",
];

/** Who rated whom, in a sentence. */
function summaryOf(row: EvaluationRow): string {
  const student = row.student_name || row.student_id;
  if (row.evaluator_type === "supervisor") {
    return `${row.evaluator_name || "Supervisor"} rated ${student}`;
  }
  if (row.evaluator_type === "teacher") {
    return `${row.evaluator_name || "Coordinator"} (coordinator) rated ${student}`;
  }
  return `${student} rated their training at ${row.company || "their company"}`;
}

export default function CoordinatorEvaluations() {
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ evaluations: EvaluationRow[] }>(
        "/api/coordinator/evaluations"
      );
      setRows(data.evaluations || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load evaluations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      supervisor: rows.filter((row) => row.evaluator_type === "supervisor").length,
      teacher: rows.filter((row) => row.evaluator_type === "teacher").length,
      student: rows.filter((row) => row.evaluator_type === "student").length,
    }),
    [rows]
  );

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.evaluator_type === filter)),
    [rows, filter]
  );
  const pager = usePagination(visible, 15);

  return (
    <CoordinatorLayout
      title="Evaluations"
      subtitle="Ratings of students by supervisors and by you, and students' feedback on their companies."
      actions={
        <Button icon="plus" onClick={() => setEvaluating(true)}>
          Evaluate a student
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <FilterChips
          label="Filter evaluations"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "supervisor", label: "By supervisors", count: counts.supervisor },
            { value: "teacher", label: "By coordinator", count: counts.teacher },
            { value: "student", label: "Company feedback", count: counts.student },
          ]}
        />

        <Card>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="star"
              title={rows.length === 0 ? "No evaluations yet" : "No evaluations of this kind"}
              description={
                rows.length === 0
                  ? "Evaluations from supervisors, students and you will be listed here."
                  : undefined
              }
            />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {pager.pageItems.map((row) => (
                <li key={row.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{row.category}</p>
                      <p className="text-sm text-slate-600">{summaryOf(row)}</p>
                    </div>
                    <Stars value={row.rating} size={16} />
                  </div>
                  {row.comments && (
                    <p className="mt-2 whitespace-pre-line border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                      {row.comments}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {formatDate(row.eval_date || row.created_at)}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination state={pager} noun="evaluation" />
            </>
          )}
        </Card>
      </div>

      <EvaluateDialog
        open={evaluating}
        onClose={() => setEvaluating(false)}
        onSaved={() => {
          setEvaluating(false);
          setFilter("all");
          void load();
        }}
      />
    </CoordinatorLayout>
  );
}

function EvaluateDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || students.length > 0) return;
    coordinatorRequest<{ students: StudentOption[] }>("/api/coordinator/students?status=active")
      .then((data) => setStudents(data.students || []))
      .catch(() => setError("The student list could not be loaded."));
  }, [open, students.length]);

  const reset = () => {
    setStudentId("");
    setCategory(CATEGORIES[0]);
    setRating(0);
    setComments("");
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) return setError("Choose the student you are evaluating.");
    if (!rating) return setError("Choose a rating from 1 to 5 stars.");
    setSaving(true);
    setError("");
    try {
      await coordinatorRequest("/api/evaluations", {
        method: "POST",
        body: { student_id: studentId, category, rating, comments: comments.trim() || null },
      });
      const name = students.find((item) => item.student_id === studentId)?.name || "The student";
      toast.success(`Evaluation saved. ${name} has been notified.`);
      reset();
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The evaluation could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Evaluate a student"
      description="The student sees this evaluation on their Feedback page."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="evaluation-form" busy={saving}>
            {saving ? "Saving" : "Save evaluation"}
          </Button>
        </>
      }
    >
      <form id="evaluation-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormField label="Student" htmlFor="evaluation-student">
          <select
            id="evaluation-student"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="field"
          >
            <option value="">Choose a student</option>
            {students.map((item) => (
              <option key={item.student_id} value={item.student_id}>
                {item.name}
                {item.company ? ` · ${item.company}` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="What are you rating?" htmlFor="evaluation-category">
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
        </FormField>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Rating</p>
          <StarInput value={rating} onChange={setRating} label="Rating from 1 to 5 stars" />
        </div>
        <FormField label="Comments" htmlFor="evaluation-comments" optional>
          <textarea
            id="evaluation-comments"
            rows={4}
            maxLength={2000}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            className="field resize-none"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
