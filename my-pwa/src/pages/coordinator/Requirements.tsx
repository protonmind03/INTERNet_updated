import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import DeliverableDialog from "./DeliverableDialog";
import { deliverableLine, type DeliverableFields } from "./deliverableText";

/*
 * Coordinator use case "Set OJT Requirements":
 *  - the documents every student must submit, and
 *  - where each student's weekly OJT schedule is set (it is no longer edited here).
 * Required hours stay on the student's account (Students page).
 */

type Requirement = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
} & DeliverableFields;

export default function CoordinatorRequirements() {
  return (
    <CoordinatorLayout
      title="Requirements"
      subtitle="What students must submit, when it is due and who reviews it; and where schedules are set."
    >
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <RequiredDocuments />
        <StudentSchedule />
      </div>
    </CoordinatorLayout>
  );
}

/*
|--------------------------------------------------------------------------
| REQUIRED DOCUMENTS
|--------------------------------------------------------------------------
*/

function RequiredDocuments() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<Requirement | null>(null);
  // The requirement whose due date, reviewer and reach are being set.
  const [settingUp, setSettingUp] = useState<Requirement | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ requirements: Requirement[] }>(
        "/api/ojt-requirements?all=1"
      );
      setRequirements(data.requirements || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the requirements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) {
      setAddError("Enter a name for the requirement.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await coordinatorRequest("/api/coordinator/requirements", {
        method: "POST",
        body: {
          name: newName.trim(),
          description: newDescription.trim() || null,
          sort_order: requirements.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
          is_active: true,
        },
      });
      toast.success(`"${newName.trim()}" added to every student's checklist.`);
      setNewName("");
      setNewDescription("");
      await load();
    } catch (saveError) {
      setAddError(errorText(saveError, "The requirement could not be added."));
    } finally {
      setAdding(false);
    }
  };

  const update = async (requirement: Requirement, message: string) => {
    setSavingId(requirement.id);
    try {
      await coordinatorRequest(`/api/coordinator/requirements/${requirement.id}`, {
        method: "PUT",
        body: requirement,
      });
      toast.success(message);
      setEditing(null);
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The requirement could not be saved."));
    } finally {
      setSavingId(null);
    }
  };

  const active = requirements.filter((item) => item.is_active).length;

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Required documents"
        description={
          loading
            ? undefined
            : `${active} active. Retired items leave the checklist but keep their upload history.`
        }
      />
      <div className="mt-3">
        {error && (
          <div className="px-4 pb-3 sm:px-5">
            <ErrorNotice message={error} onRetry={() => void load()} />
          </div>
        )}
        {loading ? (
          <SkeletonRows rows={5} />
        ) : requirements.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="No requirements yet"
            description="Add the first document students must submit."
          />
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {requirements.map((item) =>
              editing?.id === item.id ? (
                <li key={item.id} className="space-y-3 bg-slate-50 px-4 py-4 sm:px-5">
                  <FormField label="Name" htmlFor={`requirement-name-${item.id}`}>
                    <input
                      id={`requirement-name-${item.id}`}
                      type="text"
                      maxLength={150}
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      className="field"
                    />
                  </FormField>
                  <FormField
                    label="Description"
                    htmlFor={`requirement-description-${item.id}`}
                    optional
                  >
                    <input
                      id={`requirement-description-${item.id}`}
                      type="text"
                      maxLength={300}
                      value={editing.description || ""}
                      onChange={(event) =>
                        setEditing({ ...editing, description: event.target.value })
                      }
                      className="field"
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      busy={savingId === item.id}
                      doneLabel="Saved"
                      disabled={!editing.name.trim()}
                      onClick={() =>
                        void update(
                          { ...editing, name: editing.name.trim() },
                          "Requirement saved."
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </li>
              ) : (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-medium ${
                          item.is_active ? "text-slate-900" : "text-slate-500"
                        }`}
                      >
                        {item.name}
                      </p>
                      {!item.is_active && <StatusBadge status="Retired" tone="neutral" />}
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                    )}
                    {deliverableLine(item) && (
                      <p className="mt-0.5 text-sm font-medium text-slate-700">{deliverableLine(item)}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {/* Roadmap 5.5: straight to the files submitted for it. */}
                    <Link
                      to={`/coordinator/documents?doc_type=${encodeURIComponent(item.name)}`}
                      className="rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-slate-100"
                    >
                      Submissions<span className="sr-only"> for {item.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSettingUp(item)}
                      className="rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-slate-100"
                    >
                      Due date and reviewer<span className="sr-only"> for {item.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-slate-100"
                    >
                      Edit<span className="sr-only"> {item.name}</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingId === item.id}
                      onClick={() =>
                        void update(
                          { ...item, is_active: !item.is_active },
                          item.is_active
                            ? `"${item.name}" retired.`
                            : `"${item.name}" restored to the checklist.`
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 ${
                        item.is_active ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {savingId === item.id && (
                        <BrandLoader variant="button" role="coordinator" process="save" />
                      )}
                      {item.is_active ? "Retire" : "Restore"}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}

        {settingUp && (
          <DeliverableDialog
            key={settingUp.id}
            requirement={settingUp}
            onClose={() => setSettingUp(null)}
            onSaved={() => {
              setSettingUp(null);
              void load();
            }}
          />
        )}

        <form
          onSubmit={add}
          className="space-y-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
          noValidate
        >
          <p className="text-sm font-semibold text-slate-900">Add a requirement</p>
          <FormField label="Name" htmlFor="new-requirement-name">
            <input
              id="new-requirement-name"
              type="text"
              maxLength={150}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="For example, Certificate of Completion"
              className="field"
            />
          </FormField>
          <FormField label="Description" htmlFor="new-requirement-description" optional>
            <input
              id="new-requirement-description"
              type="text"
              maxLength={300}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="What the student should upload"
              className="field"
            />
          </FormField>
          <FormError message={addError} />
          <Button type="submit" icon="plus" busy={adding} doneLabel="Added" failed={Boolean(addError)}>
            Add requirement
          </Button>
        </form>
      </div>
    </Card>
  );
}

/*
|--------------------------------------------------------------------------
| STUDENT SCHEDULE
|--------------------------------------------------------------------------
*/

/**
 * Schedules used to be edited here, one student at a time. They are now
 * set where the students are: one student's on their record, a whole
 * block's from Programs or Students. This card says so, and an old link
 * that named a student ("?student=") still leads to that student.
 */
function StudentSchedule() {
  const [searchParams] = useSearchParams();
  const selected = searchParams.get("student") || "";
  return (
    <Card>
      <CardHeader title="Schedules" description="The days and hours students report for OJT." />
      <div className="mt-3 space-y-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-700 sm:px-5">
        <p className="flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2.5">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            A student's schedule is on their own record, under the Schedule tab, beside their attendance
            and hours.
            {selected && (
              <>
                {" "}
                <Link
                  to={`/coordinator/students/${encodeURIComponent(selected)}?tab=schedule`}
                  className="font-semibold text-psu-700 hover:underline"
                >
                  Open this student's record
                </Link>
              </>
            )}
          </span>
        </p>
        <p>
          To give every student of a block the same schedule, open{" "}
          <Link to="/coordinator/programs" className="font-semibold text-psu-700 hover:underline">
            Programs
          </Link>
          , find the block, and choose "Set schedule". The same button is on{" "}
          <Link to="/coordinator/students" className="font-semibold text-psu-700 hover:underline">
            Students
          </Link>{" "}
          once a block is chosen in the filters.
        </p>
      </div>
    </Card>
  );
}
