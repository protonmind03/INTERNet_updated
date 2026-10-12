import { useState } from "react";
import { Button, FormError, Modal } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| The targets the six key figures are judged against. One set for the
| programme; a change is recorded in the audit log. A figure left at its
| default keeps following the default.
*/

export type TargetRow = {
  key: string;
  label: string;
  unit: "percent" | "days" | "count";
  direction: "atLeast" | "atMost";
  target: number;
  default_target: number;
};

const UNIT: Record<TargetRow["unit"], { suffix: string; max: number; step: string }> = {
  percent: { suffix: "%", max: 100, step: "1" },
  days: { suffix: "days", max: 60, step: "0.1" },
  count: { suffix: "", max: 1000, step: "1" },
};

/** Mounted only while open, so it starts from the targets in force. */
export default function KpiTargetsDialog({
  rows,
  onClose,
  onSaved,
}: {
  rows: TargetRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, String(row.target)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const targets: Record<string, number> = {};
    for (const row of rows) {
      const typed = values[row.key].trim();
      const value = Number(typed);
      if (typed === "" || !Number.isFinite(value)) return setError(`Enter a number for "${row.label}".`);
      if (value !== row.target) targets[row.key] = value;
    }
    if (Object.keys(targets).length === 0) return onClose();
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/kpi-targets", {
        method: "PUT",
        body: { targets },
      });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The targets could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Targets for the key figures"
      description="What each figure is judged against, for every coordinator. A change is recorded in the audit log."
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="kpi-targets-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save targets"}
          </Button>
        </>
      }
    >
      <form id="kpi-targets-form" onSubmit={save} className="space-y-3" noValidate>
        {rows.map((row) => {
          const unit = UNIT[row.unit];
          const id = `kpi-target-${row.key}`;
          const changed = Number(values[row.key]) !== row.default_target;
          return (
            <div key={row.key} className="rounded-lg border border-slate-200 p-3">
              <label htmlFor={id} className="block text-sm font-medium text-slate-900">
                {row.label}
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm text-slate-600">{row.direction === "atLeast" ? "At least" : "At most"}</span>
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={unit.max}
                  step={unit.step}
                  value={values[row.key]}
                  onChange={(event) => setValues((current) => ({ ...current, [row.key]: event.target.value }))}
                  aria-describedby={`${id}-default`}
                  className="field w-28"
                />
                {unit.suffix && <span className="text-sm text-slate-600">{unit.suffix}</span>}
                <span id={`${id}-default`} className="text-xs text-slate-600">
                  Default: {row.default_target}
                  {row.unit === "percent" ? "%" : ""}
                </span>
                {changed && (
                  <button
                    type="button"
                    onClick={() => setValues((current) => ({ ...current, [row.key]: String(row.default_target) }))}
                    className="rounded-md px-2 py-1.5 text-sm font-semibold text-psu-700 hover:bg-slate-100"
                  >
                    Use the default<span className="sr-only"> for {row.label}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
