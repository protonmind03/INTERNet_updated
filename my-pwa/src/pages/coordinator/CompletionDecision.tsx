import { useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, FormError, FormField } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.5: the coordinator approves a student's completion review, or
| returns it with what to fix (the student can then ask again). Shown on
| the record's overview once the student has asked, and after approval.
*/

type Student = {
  student_id: string;
  name: string;
  completion_requested_at?: string | null;
  completion_approved_at?: string | null;
  completion_approved_by_name?: string | null;
};

export default function CompletionDecision({ student, onDecided }: { student: Student; onDecided: () => void }) {
  const [deciding, setDeciding] = useState<"approve" | "return" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!student.completion_requested_at) return null;
  const approved = Boolean(student.completion_approved_at);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/students/${encodeURIComponent(student.student_id)}/completion/${deciding}`, {
        method: "POST",
        body: deciding === "return" ? { note } : {},
      });
      toast.success(data.message);
      setDeciding(null);
      setNote("");
      onDecided();
    } catch (decideError) {
      setError(errorText(decideError, "The decision could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon="check-circle"
        title="Completion review"
        description={
          approved
            ? `Approved ${formatDate(student.completion_approved_at)}${student.completion_approved_by_name ? ` by ${student.completion_approved_by_name}` : ""}.`
            : `${student.name} asked on ${formatDate(student.completion_requested_at)}. Check the time record and the final evaluation.`
        }
      />
      <div className="flex flex-wrap gap-2 px-4 pb-5 pt-3 sm:px-5">
        {!approved && <Button onClick={() => setDeciding("approve")}>Approve completion</Button>}
        <Button variant="secondary" onClick={() => setDeciding("return")}>
          {approved ? "Take back and return" : "Return it"}
        </Button>
      </div>
      <ConfirmDialog
        open={deciding !== null}
        title={deciding === "approve" ? `Approve ${student.name}'s completion?` : `Return ${student.name}'s completion review?`}
        message={
          deciding === "approve"
            ? "The student is told their OJT completion is approved."
            : "The student is told what to fix, and can ask again once it is fixed."
        }
        confirmLabel={deciding === "approve" ? "Approve completion" : "Return it"}
        tone={deciding === "return" ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => void decide()}
        onCancel={() => {
          setDeciding(null);
          setError("");
        }}
      >
        {deciding === "return" && (
          <FormField label="What to fix" htmlFor="completion-note">
            <textarea id="completion-note" className="field min-h-20" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        )}
        <FormError message={error} />
      </ConfirmDialog>
    </Card>
  );
}
