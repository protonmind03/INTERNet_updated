import { useCallback, useEffect, useState } from "react";
import { Button, FormError, FormField } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

/*
| Phase 2.2: while the coordinator has the term's choice window open, a
| trainee ranks up to three agencies: approved ones that take their program
| and still have a free slot. The coordinator assigns; the trainee is told.
| Shown only when there is a window and no agency yet. Needs a connection.
*/

type Option = { id: number; name: string; address: string | null; free: number | null };
type Choice = { rank: number; company_id: number; name: string };
type Answer = {
  window: { state: "none" | "not_yet" | "open" | "closed"; term: string | null; opens_at: string | null; closes_at: string | null };
  assigned: string | null;
  options: Option[];
  choices: Choice[];
};

const RANKS = ["First choice", "Second choice", "Third choice"];

export default function ChooseAgency() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [picked, setPicked] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/company-choices`, withStudentAuth()).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as Answer;
    setAnswer(data);
    setPicked(RANKS.map((_, index) => String(data.choices.find((choice) => choice.rank === index + 1)?.company_id ?? "")));
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!answer || answer.assigned || answer.window.state === "none") return null;
  const { window: span, options, choices } = answer;

  const save = async () => {
    const ids = picked.filter(Boolean).map(Number);
    if (new Set(ids).size !== ids.length) {
      setError("Choose each agency once.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/students/${encodeURIComponent(studentId!)}/company-choices`,
        withStudentAuth({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_ids: ids }) })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your choices could not be saved.");
      toast.success(data.message);
      await load();
    } catch (saveError) {
      setError(errorText(saveError, "Your choices could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="choose-agency-title" className="mt-4 border-t border-slate-100 pt-3">
      <h3 id="choose-agency-title" className="text-sm font-semibold text-slate-900">
        Choose your agency
      </h3>
      {span.state === "open" ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Rank up to three. Your coordinator assigns you. Open until {formatDateTime(span.closes_at)}.
          </p>
          {options.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No agency has a free slot for your program right now. Ask your coordinator.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {RANKS.map((label, index) => (
                <FormField key={label} label={label} htmlFor={`agency-choice-${index}`} optional={index > 0}>
                  <select
                    id={`agency-choice-${index}`}
                    className="field min-h-11"
                    value={picked[index]}
                    onChange={(event) => setPicked((current) => current.map((value, at) => (at === index ? event.target.value : value)))}
                  >
                    <option value="">None</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                        {option.free !== null ? `, ${option.free} ${option.free === 1 ? "slot" : "slots"} free` : ""}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
              <FormError message={error} />
              <Button busy={busy} onClick={() => void save()}>
                Save my choices
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            {span.state === "not_yet" ? `Choosing opens ${formatDateTime(span.opens_at)}.` : "Choosing is closed. Your coordinator assigns you."}
          </p>
          {choices.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-900">
              {choices.map((choice) => (
                <li key={choice.rank}>{choice.name}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
