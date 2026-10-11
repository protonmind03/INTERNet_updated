import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
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
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| SITE VISITS
|--------------------------------------------------------------------------
|
| The coordinator's visits to host companies: when, what was found, and
| what to follow up. Opened from a company's menu it shows that company's
| visits only.
|
*/

type Visit = {
  id: number;
  company_id: number;
  company: string;
  visit_date: string;
  visited_by_name: string;
  findings: string;
  follow_up: string | null;
};

type CompanyOption = { id: number; name: string; is_active: boolean };

export default function SiteVisits() {
  const [params, setParams] = useSearchParams();
  const companyId = /^\d+$/.test(params.get("company") || "") ? Number(params.get("company")) : null;

  const [visits, setVisits] = useState<Visit[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Visit | "new" | null>(null);
  const [removing, setRemoving] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [visitData, companyData] = await Promise.all([
        coordinatorRequest<{ visits: Visit[] }>(
          `/api/coordinator/site-visits${companyId ? `?company_id=${companyId}` : ""}`
        ),
        coordinatorRequest<{ companies: CompanyOption[] }>("/api/coordinator/company-records"),
      ]);
      setVisits(visitData.visits || []);
      setCompanies(companyData.companies || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the site visits."));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/site-visits/${removing.id}`,
        { method: "DELETE" }
      );
      toast.success(data.message);
      setRemoving(null);
      await load();
    } catch (removeError) {
      toast.error(errorText(removeError, "The visit could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  const chosen = companies.find((company) => company.id === companyId);

  return (
    <CoordinatorLayout
      title="Site visits"
      subtitle="Your visits to host companies, and what each one found."
      actions={
        <Button icon="plus" onClick={() => setEditing("new")} disabled={companies.length === 0}>
          Log a visit
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium text-slate-700">
          Company
          <select
            value={companyId ?? ""}
            onChange={(event) =>
              setParams(event.target.value ? { company: event.target.value } : {})
            }
            className="field"
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <Card>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : visits.length === 0 ? (
            <EmptyState
              icon="building"
              title={chosen ? `No visits to ${chosen.name} yet` : "No visits logged yet"}
              description={
                companies.length === 0
                  ? "Add a company on the Companies page first; a visit is logged against a company."
                  : "Log each visit after it happens, with what you found."
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visits.map((visit) => (
                <li key={visit.id} className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold text-slate-900">{visit.company}</p>
                    <p className="text-xs text-slate-500">
                      {formatLongDate(visit.visit_date)} · {visit.visited_by_name}
                    </p>
                    <p className="whitespace-pre-line break-words text-sm text-slate-700">
                      {visit.findings}
                    </p>
                    {visit.follow_up && (
                      <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-950">
                        <span className="font-semibold">To follow up:</span> {visit.follow_up}
                      </p>
                    )}
                  </div>
                  <RowMenu
                    label={`Actions for the visit to ${visit.company} on ${visit.visit_date}`}
                    items={[
                      { label: "Edit", icon: "edit", onSelect: () => setEditing(visit) },
                      { label: "Remove", icon: "trash", tone: "danger", onSelect: () => setRemoving(visit) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <VisitDialog
          visit={editing === "new" ? null : editing}
          companies={companies}
          startCompany={companyId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this visit?"
        message={
          removing
            ? `The record of the visit to ${removing.company} on ${formatLongDate(removing.visit_date)} will be removed.`
            : ""
        }
        confirmLabel="Remove visit"
        tone="danger"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      />
    </CoordinatorLayout>
  );
}

function VisitDialog({
  visit,
  companies,
  startCompany,
  onClose,
  onSaved,
}: {
  visit: Visit | null;
  companies: CompanyOption[];
  startCompany: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = localDateKey(new Date());
  const [company, setCompany] = useState(String(visit?.company_id ?? startCompany ?? ""));
  const [date, setDate] = useState(visit?.visit_date || today);
  const [findings, setFindings] = useState(visit?.findings || "");
  const [followUp, setFollowUp] = useState(visit?.follow_up || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!company) return setError("Choose the company that was visited.");
    if (!date) return setError("Give the date of the visit.");
    if (findings.trim().length < 10) return setError("Say what you found on the visit.");
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        visit ? `/api/coordinator/site-visits/${visit.id}` : "/api/coordinator/site-visits",
        {
          method: visit ? "PUT" : "POST",
          body: { company_id: Number(company), visit_date: date, findings, follow_up: followUp },
        }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The visit could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={visit ? "Edit visit" : "Log a visit"}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="visit-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : visit ? "Save changes" : "Log visit"}
          </Button>
        </>
      }
    >
      <form id="visit-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Company" htmlFor="visit-company">
            <select
              id="visit-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="field"
            >
              <option value="">Choose a company</option>
              {companies
                .filter((item) => item.is_active || String(item.id) === company)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Date of the visit" htmlFor="visit-date">
            <input
              id="visit-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormField
          label="What you found"
          htmlFor="visit-findings"
          hint="Who you met, how the interns are doing, and the working conditions."
        >
          <textarea
            id="visit-findings"
            rows={5}
            maxLength={3000}
            value={findings}
            onChange={(event) => setFindings(event.target.value)}
            className="field resize-none"
          />
        </FormField>
        <FormField label="To follow up" htmlFor="visit-follow-up" optional>
          <textarea
            id="visit-follow-up"
            rows={2}
            maxLength={1000}
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            className="field resize-none"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
