import { useEffect, useState } from "react";
import { Button, FormError, Modal } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import { type DeliverableFields } from "./deliverableText";

/*
| A requirement's deliverable settings: when it is due, who reviews what
| students upload for it, and which programs or blocks it is asked of.
| The rules are the server's (backend/src/services/deliverables.ts); this
| form sends what was chosen and shows what the server says is wrong.
*/

type Program = { id: number; name: string; short_code: string; is_active: boolean };
type Block = { id: number; name: string; term_name: string | null; is_active: boolean };
type DueKind = "none" | "date" | "week" | "weekly";

/** Mounted only while open, with a `key` of the requirement, so it starts from what is saved. */
export default function DeliverableDialog({
  requirement,
  onClose,
  onSaved,
}: {
  requirement: { id: number; name: string } & DeliverableFields;
  onClose: () => void;
  onSaved: () => void;
}) {
  const weekSaved = /^week:(\d{1,2})$/.exec(requirement.due_rule ?? "");
  const [kind, setKind] = useState<DueKind>(
    requirement.due_date ? "date" : requirement.due_rule === "weekly" ? "weekly" : weekSaved ? "week" : "none"
  );
  const [date, setDate] = useState(requirement.due_date ?? "");
  const [week, setWeek] = useState(weekSaved ? weekSaved[1] : "6");
  const [reviewer, setReviewer] = useState<"supervisor" | "coordinator">(requirement.reviewer_role ?? "supervisor");
  const [programs, setPrograms] = useState<Set<number>>(() => new Set(requirement.applies_to?.program_ids ?? []));
  const [blocks, setBlocks] = useState<Set<number>>(() => new Set(requirement.applies_to?.block_ids ?? []));
  const [catalogue, setCatalogue] = useState<{ programs: Program[]; blocks: Block[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ programs: Program[]; blocks: Block[] }>("/api/coordinator/academics")
      .then((data) => {
        if (current) setCatalogue({ programs: data.programs || [], blocks: data.blocks || [] });
      })
      .catch(() => {
        if (current) setCatalogue({ programs: [], blocks: [] });
      });
    return () => {
      current = false;
    };
  }, []);

  const toggle = (set: Set<number>, update: (next: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (kind === "date" && !date) return setError("Choose the day it is due.");
    const weekNumber = Number(week);
    if (kind === "week" && !(Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= 52)) {
      return setError("Enter a week from 1 to 52.");
    }
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/requirements/${requirement.id}/deliverable`,
        {
          method: "PUT",
          body: {
            due_date: kind === "date" ? date : null,
            due_rule: kind === "week" ? `week:${weekNumber}` : kind === "weekly" ? "weekly" : null,
            reviewer_role: reviewer,
            applies_to: { program_ids: [...programs], block_ids: [...blocks] },
          },
        }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The settings could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const radio = "mt-1 h-4 w-4 border-slate-400 text-psu-700";
  const option = "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50";
  // A program or block already chosen stays listed even if it has since been made inactive.
  const listedPrograms = (catalogue?.programs ?? []).filter((item) => item.is_active || programs.has(item.id));
  const listedBlocks = (catalogue?.blocks ?? []).filter((item) => item.is_active || blocks.has(item.id));

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={`Due date and reviewer: ${requirement.name}`}
      description="When it is due, who reviews it, and who it is asked of."
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="deliverable-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form id="deliverable-form" onSubmit={save} className="space-y-5" noValidate>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">When is it due?</legend>
          <div className="mt-2 space-y-2">
            <label className={option}>
              <input type="radio" name="due-kind" className={radio} checked={kind === "none"} onChange={() => setKind("none")} />
              <span>
                <span className="block text-sm font-medium text-slate-900">No due date</span>
                <span className="block text-xs text-slate-600">As requirements were until now.</span>
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="due-kind" className={radio} checked={kind === "date" } onChange={() => setKind("date")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">On a date</span>
                <span className="block text-xs text-slate-600">The same day for every student.</span>
                {kind === "date" && (
                  <input
                    type="date"
                    aria-label="The day it is due"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="field mt-2 max-w-48"
                  />
                )}
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="due-kind" className={radio} checked={kind === "week"} onChange={() => setKind("week")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">By the end of a week of the term</span>
                <span className="block text-xs text-slate-600">
                  Counted from the start of each student's term, so each term's students get their own date.
                </span>
                {kind === "week" && (
                  <span className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    Week
                    <input
                      type="number"
                      aria-label="Week of the term"
                      min={1}
                      max={52}
                      value={week}
                      onChange={(event) => setWeek(event.target.value)}
                      className="field w-24"
                    />
                  </span>
                )}
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="due-kind" className={radio} checked={kind === "weekly"} onChange={() => setKind("weekly")} />
              <span>
                <span className="block text-sm font-medium text-slate-900">Every week</span>
                <span className="block text-xs text-slate-600">
                  One upload a week, due each Sunday of the term. Not for the weekly report: students already
                  write that, and it is not counted among the documents needed to complete.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Who reviews what students upload?</legend>
          <div className="mt-2 space-y-2">
            <label className={option}>
              <input type="radio" name="reviewer" className={radio} checked={reviewer === "supervisor"} onChange={() => setReviewer("supervisor")} />
              <span>
                <span className="block text-sm font-medium text-slate-900">The student's supervisor</span>
                <span className="block text-xs text-slate-600">It goes to their Review queue, as now.</span>
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="reviewer" className={radio} checked={reviewer === "coordinator"} onChange={() => setReviewer("coordinator")} />
              <span>
                <span className="block text-sm font-medium text-slate-900">The OJT coordinator</span>
                <span className="block text-xs text-slate-600">
                  You approve or reject it on the Documents page. It does not go to the supervisor.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Who is it asked of?</legend>
          <p className="mt-1 text-xs text-slate-600">
            {programs.size + blocks.size === 0
              ? "Everyone. Tick programs or blocks to ask it only of them."
              : "Only students in a ticked program or a ticked block."}
          </p>
          {catalogue === null ? (
            <p className="mt-2 text-sm text-slate-600">Loading programs and blocks…</p>
          ) : listedPrograms.length + listedBlocks.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No programs or blocks are set up yet, so it is asked of everyone.</p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Programs", listedPrograms.map((item) => ({ id: item.id, label: `${item.short_code}: ${item.name}` })), programs, setPrograms],
                  ["Blocks", listedBlocks.map((item) => ({ id: item.id, label: item.term_name ? `${item.name} (${item.term_name})` : item.name })), blocks, setBlocks],
                ] as const
              ).map(([heading, rows, chosen, update]) => (
                <div key={heading}>
                  <p className="text-xs font-medium text-slate-600">{heading}</p>
                  <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" tabIndex={0} aria-label={heading}>
                    {rows.length === 0 && <li className="px-3 py-2 text-sm text-slate-600">None yet.</li>}
                    {rows.map((row) => (
                      <li key={row.id}>
                        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={chosen.has(row.id)}
                            onChange={() => toggle(chosen, update, row.id)}
                            className="h-4 w-4 rounded border-slate-400 text-psu-700"
                          />
                          <span className="min-w-0 break-words text-sm text-slate-800">{row.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <FormError message={error} />
      </form>
    </Modal>
  );
}
