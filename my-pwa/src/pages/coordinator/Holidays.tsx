import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SkeletonRows,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatLongDate, localDateKey } from "../../lib/format";
import type { Holiday } from "../../lib/useHolidays";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| HOLIDAYS
|--------------------------------------------------------------------------
|
| The days nobody is expected to report. Students see them on their
| schedule, and they are marked on every Daily Time Record. A holiday does
| not stop a student timing in if their company works that day.
|
*/

export default function CoordinatorHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Holiday | "new" | null>(null);
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ holidays: Holiday[] }>("/api/holidays");
      setHolidays(data.holidays || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the holidays."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const today = localDateKey(new Date());
  const upcoming = holidays.filter((holiday) => holiday.date >= today);
  const past = holidays.filter((holiday) => holiday.date < today).reverse();

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/holidays/${removing.id}`,
        { method: "DELETE" }
      );
      toast.success(data.message);
      setRemoving(null);
      await load();
    } catch (removeError) {
      toast.error(errorText(removeError, "The holiday could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  const list = (items: Holiday[]) => (
    <ul className="divide-y divide-slate-100 border-t border-slate-100">
      {items.map((holiday) => (
        <li key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{holiday.name}</p>
            <p className="tabular text-sm text-slate-600">
              {formatLongDate(holiday.date)}
              {holiday.date === today && (
                <span className="ml-2 font-semibold text-psu-700">Today</span>
              )}
            </p>
          </div>
          <RowMenu
            label={`Actions for ${holiday.name}`}
            items={[
              { label: "Edit", icon: "edit", onSelect: () => setEditing(holiday) },
              { label: "Remove", icon: "trash", tone: "danger", onSelect: () => setRemoving(holiday) },
            ]}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <CoordinatorLayout
      title="Holidays"
      subtitle="The days nobody is expected to report. Shown on schedules and time records."
      actions={
        <Button icon="plus" onClick={() => setEditing("new")}>
          Add holiday
        </Button>
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <CardHeader
            title="Upcoming"
            description={
              loading || upcoming.length === 0
                ? undefined
                : `${upcoming.length} ${upcoming.length === 1 ? "holiday" : "holidays"} from today on`
            }
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={3} />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No upcoming holidays"
                description="Add the national holidays and any day the campus declares, so students know not to report."
              />
            ) : (
              list(upcoming)
            )}
          </div>
        </Card>

        {!loading && past.length > 0 && (
          <Card>
            <CardHeader title="Past" description="Kept so earlier time records still show them." />
            <div className="mt-3">{list(past)}</div>
          </Card>
        )}
      </div>

      {editing && (
        <HolidayDialog
          holiday={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : ""}
        message={
          removing
            ? `${formatLongDate(removing.date)} will no longer be shown as a holiday on schedules and time records. No attendance is changed.`
            : ""
        }
        confirmLabel="Remove holiday"
        tone="danger"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      />
    </CoordinatorLayout>
  );
}

function HolidayDialog({
  holiday,
  onClose,
  onSaved,
}: {
  holiday: Holiday | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(holiday?.name || "");
  const [date, setDate] = useState(holiday?.date || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Choose the date of the holiday.");
    if (name.trim().length < 2) return setError("Give the holiday a name.");
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        holiday ? `/api/coordinator/holidays/${holiday.id}` : "/api/coordinator/holidays",
        { method: holiday ? "PUT" : "POST", body: { date, name } }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The holiday could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={holiday ? "Edit holiday" : "Add holiday"}
      description={holiday ? undefined : "For example, Bonifacio Day on 30 November."}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="holiday-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : holiday ? "Save changes" : "Add holiday"}
          </Button>
        </>
      }
    >
      <form id="holiday-form" onSubmit={submit} className="space-y-4">
        <FormField label="Date" htmlFor="holiday-date">
          <input
            id="holiday-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Name" htmlFor="holiday-name">
          <input
            id="holiday-name"
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
