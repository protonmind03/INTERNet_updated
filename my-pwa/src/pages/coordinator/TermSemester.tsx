import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, FormError, FormField } from "../../components/ui";
import { SEMESTER_LABELS, type Semester } from "../../lib/semesters";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.6: under a term with a semester. Students whose program's OJT is
| in another semester are named, as a warning. Students in the first part
| of a two-term program can be carried over into the next term, with their
| hours and records, before this one is closed. They are grouped by the
| semester they continue in, since one carry-over moves one group.
*/

type Person = { student_id: string; name: string; program: string | null };
type Check = { semester: Semester | null; elsewhere: (Person & { program_semesters: Semester[] })[]; continuing: (Person & { next_semester: Semester })[] };
type TermLite = { id: number; name: string; is_closed: boolean; semester?: Semester | null };

const names = (people: Person[]) => {
  const shown = people.slice(0, 4).map((person) => person.name).join(", ");
  return people.length > 4 ? `${shown} and ${people.length - 4} more` : shown;
};

export default function TermSemester({ term, terms, onMoved }: { term: { id: number; semester: Semester }; terms: TermLite[]; onMoved: () => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  // The group being carried over (its next semester), and the term chosen for it.
  const [carrying, setCarrying] = useState<Semester | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCheck(await coordinatorRequest<Check>(`/api/coordinator/terms/${term.id}/semester-check`));
    } catch {
      setCheck(null);
    }
  }, [term.id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!check || (check.elsewhere.length === 0 && check.continuing.length === 0)) return null;
  const groups = [...new Set(check.continuing.map((person) => person.next_semester))].map((next) => ({
    next,
    people: check.continuing.filter((person) => person.next_semester === next),
    targets: terms.filter((other) => other.id !== term.id && !other.is_closed && other.semester === next),
  }));
  const chosen = groups.find((group) => group.next === carrying);

  const carry = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/terms/${term.id}/carry-over`, { method: "POST", body: { to_term_id: Number(target) } });
      toast.success(data.message);
      setCarrying(null);
      await load();
      onMoved();
    } catch (carryError) {
      setError(errorText(carryError, "The students could not be carried over."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {check.elsewhere.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {check.elsewhere.length === 1 ? "1 student is" : `${check.elsewhere.length} students are`} in a program whose OJT is in another semester: {names(check.elsewhere)}.
        </p>
      )}
      {groups.map(({ next, people, targets }) => (
        <div key={next} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
          <p>
            {people.length === 1 ? "1 student continues" : `${people.length} students continue`} their OJT in the {SEMESTER_LABELS[next].toLowerCase()}: {names(people)}.
            {targets.length === 0 ? ` Add a ${SEMESTER_LABELS[next].toLowerCase()} term to carry them over.` : ""}
          </p>
          {targets.length > 0 && (
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setTarget(String(targets[0].id));
                setCarrying(next);
              }}
            >
              Carry them over
              {groups.length > 1 && <span className="sr-only"> into the {SEMESTER_LABELS[next].toLowerCase()}</span>}
            </Button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={carrying !== null}
        title="Carry the continuing students over?"
        message="They move into the next term with their hours and records, and leave this term's block. Do this before closing this term."
        confirmLabel="Carry them over"
        busy={busy}
        onConfirm={() => void carry()}
        onCancel={() => {
          setCarrying(null);
          setError("");
        }}
      >
        <FormField label="Into the term" htmlFor={`carry-${term.id}`}>
          <select id={`carry-${term.id}`} className="field min-h-11" value={target} onChange={(event) => setTarget(event.target.value)}>
            {(chosen?.targets ?? []).map((other) => (
              <option key={other.id} value={other.id}>{other.name}</option>
            ))}
          </select>
        </FormField>
        <FormError message={error} />
      </ConfirmDialog>
    </div>
  );
}
