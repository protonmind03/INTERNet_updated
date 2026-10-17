import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  RowMenu,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { daysUntil, formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { forgetCompanyNames } from "./companyNames";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| COMPANIES
|--------------------------------------------------------------------------
|
| The host companies: who to contact, when the agreement with the
| university runs out, and how many of its intern places are taken. A
| company's students and supervisors are the accounts that carry its name.
|
*/

type Company = {
  id: number;
  name: string;
  address: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  moa_start: string | null;
  moa_expiry: string | null;
  slots: number | null;
  /** Migration 060. Missing from an older server. */
  industry?: string | null;
  website?: string | null;
  hr_contact?: string | null;
  is_active: boolean;
  active_students: number;
  students: number;
  supervisors: number;
  /** Missing when the answer comes from a server older than site visits. */
  visits?: number;
  last_visit?: string | null;
};

type Unlinked = { name: string; people: number };
type Scope = "active" | "expiring" | "inactive";

const EXPIRING_WITHIN_DAYS = 30;

/** How the agreement stands today. */
function agreement(company: Company): { label: string; tone: "good" | "waiting" | "bad" | "neutral" } {
  if (!company.moa_expiry) return { label: "No end date", tone: "neutral" };
  const days = daysUntil(company.moa_expiry);
  if (days === null) return { label: "No end date", tone: "neutral" };
  if (days < 0) return { label: "Expired", tone: "bad" };
  if (days <= EXPIRING_WITHIN_DAYS) {
    return { label: days === 0 ? "Ends today" : `Ends in ${days} day${days === 1 ? "" : "s"}`, tone: "waiting" };
  }
  return { label: "In force", tone: "good" };
}

function needsRenewal(company: Company): boolean {
  const tone = agreement(company).tone;
  return company.is_active && (tone === "bad" || tone === "waiting");
}

export default function CoordinatorCompanies() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [unlinked, setUnlinked] = useState<Unlinked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [query, setQuery] = useState("");
  // The company being edited, a name to start a new one from, or nothing.
  const [editing, setEditing] = useState<Company | { name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ companies: Company[]; unlinked: Unlinked[] }>(
        "/api/coordinator/company-records"
      );
      setCompanies(data.companies || []);
      setUnlinked(data.unlinked || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the companies."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const text = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      companies.filter(
        (company) =>
          (scope === "inactive"
            ? !company.is_active
            : scope === "expiring"
              ? needsRenewal(company)
              : company.is_active) &&
          (!text ||
            [company.name, company.contact_person, company.contact_email, company.address]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(text)))
      ),
    [companies, scope, text]
  );
  const pager = usePagination(visible, 20);

  const setActive = async (company: Company, isActive: boolean) => {
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/company-records/${company.id}/status`,
        { method: "PATCH", body: { is_active: isActive } }
      );
      toast.success(data.message);
      forgetCompanyNames();
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The company could not be updated."));
    }
  };

  const places = (company: Company) =>
    company.slots === null
      ? `${company.active_students} active`
      : `${company.active_students} of ${company.slots} places`;

  const menuFor = (company: Company) => [
    { label: "Edit", icon: "edit" as const, onSelect: () => setEditing(company) },
    {
      label: company.visits ? `Site visits (${company.visits})` : "Site visits",
      icon: "building" as const,
      onSelect: () => navigate(`/coordinator/companies?tab=site-visits&company=${company.id}`),
    },
    company.is_active
      ? {
          label: "Mark inactive",
          icon: "close" as const,
          tone: "danger" as const,
          onSelect: () => void setActive(company, false),
        }
      : {
          label: "Mark active",
          icon: "check" as const,
          tone: "good" as const,
          onSelect: () => void setActive(company, true),
        },
  ];

  return (
    <CoordinatorLayout
      title="Companies"
      subtitle="Host companies, their contacts, and when each agreement runs out."
      actions={
        <Button icon="plus" onClick={() => setEditing({ name: "" })}>
          Add company
        </Button>
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {!loading && unlinked.length > 0 && (
          <Card>
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Company names with no record yet
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                These names are typed on active students or supervisors. Adding a record links
                everyone who carries that name.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {unlinked.map((item) => (
                  <li key={item.name}>
                    <button
                      type="button"
                      onClick={() => setEditing({ name: item.name })}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:border-psu-400 hover:bg-psu-50"
                    >
                      {item.name}
                      <span className="tabular text-xs text-slate-500">
                        {item.people} {item.people === 1 ? "person" : "people"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
            <SearchField
              value={query}
              onChange={setQuery}
              label="Search companies"
              placeholder="Search by company or contact"
              className="w-full sm:w-80"
            />
            <FilterChips
              label="Which companies"
              value={scope}
              onChange={setScope}
              options={[
                { value: "active", label: "Active", count: companies.filter((c) => c.is_active).length },
                { value: "expiring", label: "Agreement ending", count: companies.filter(needsRenewal).length },
                { value: "inactive", label: "Inactive", count: companies.filter((c) => !c.is_active).length },
              ]}
            />
          </div>

          {loading ? (
            <SkeletonRows rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={companies.length === 0 ? "building" : "search"}
              title={companies.length === 0 ? "No companies recorded yet" : "No companies match"}
              description={
                companies.length === 0
                  ? "Add the companies that host your interns to keep their contacts and agreement dates in one place."
                  : undefined
              }
            />
          ) : (
            <>
              {/* Small screens: one block per company */}
              <ul className="divide-y divide-slate-100 lg:hidden">
                {pager.pageItems.map((company) => (
                  <li key={company.id} className="flex items-start justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <Link to={`/coordinator/companies/${company.id}`} className="block truncate text-sm font-semibold text-psu-800 hover:underline">
                        {company.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {company.contact_person || "No contact"} · {places(company)}
                        {company.last_visit ? ` · visited ${formatDate(company.last_visit)}` : ""}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <StatusBadge status={agreement(company).label} tone={agreement(company).tone} />
                        {company.moa_expiry && <span>until {formatDate(company.moa_expiry)}</span>}
                      </p>
                    </div>
                    <RowMenu label={`Actions for ${company.name}`} items={menuFor(company)} />
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Company</th>
                      <th scope="col" className="px-3 py-3 font-medium">Contact</th>
                      <th scope="col" className="px-3 py-3 font-medium">Agreement</th>
                      <th scope="col" className="px-3 py-3 font-medium">Interns</th>
                      <th scope="col" className="px-3 py-3 font-medium">Supervisors</th>
                      <th scope="col" className="px-5 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pager.pageItems.map((company) => (
                      <tr key={company.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <Link to={`/coordinator/companies/${company.id}`} className="font-medium text-psu-800 hover:underline">
                            {company.name}
                          </Link>
                          <p className="text-xs text-slate-500">{company.address || "No address"}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <p>{company.contact_person || "—"}</p>
                          <p className="text-xs text-slate-500">
                            {[company.contact_email, company.contact_phone].filter(Boolean).join(" · ")}
                          </p>
                          {company.last_visit && (
                            <p className="text-xs text-slate-500">
                              Last visited {formatDate(company.last_visit)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={agreement(company).label} tone={agreement(company).tone} />
                          {company.moa_expiry && (
                            <p className="mt-1 text-xs text-slate-500">
                              until {formatDate(company.moa_expiry)}
                            </p>
                          )}
                        </td>
                        <td className="tabular px-3 py-3 text-slate-700">{places(company)}</td>
                        <td className="tabular px-3 py-3 text-slate-700">{company.supervisors}</td>
                        <td className="px-5 py-3 text-right">
                          <RowMenu label={`Actions for ${company.name}`} items={menuFor(company)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination state={pager} noun="company" plural="companies" />
            </>
          )}
        </Card>
      </div>

      {editing && (
        <CompanyDialog
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            forgetCompanyNames();
            void load();
          }}
        />
      )}
    </CoordinatorLayout>
  );
}

function CompanyDialog({
  company,
  onClose,
  onSaved,
}: {
  company: Company | { name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = "id" in company ? company : null;
  const [form, setForm] = useState({
    name: company.name,
    address: existing?.address || "",
    contact_person: existing?.contact_person || "",
    contact_email: existing?.contact_email || "",
    contact_phone: existing?.contact_phone || "",
    moa_start: existing?.moa_start || "",
    moa_expiry: existing?.moa_expiry || "",
    slots: existing?.slots === null || existing?.slots === undefined ? "" : String(existing.slots),
    industry: existing?.industry || "",
    website: existing?.website || "",
    hr_contact: existing?.hr_contact || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError("Give the company a name.");
    if (form.moa_start && form.moa_expiry && form.moa_expiry < form.moa_start) {
      return setError("The agreement cannot end before it starts.");
    }
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        existing ? `/api/coordinator/company-records/${existing.id}` : "/api/coordinator/company-records",
        { method: existing ? "PUT" : "POST", body: { ...form, slots: form.slots === "" ? null : Number(form.slots) } }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The company could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const renaming = existing && form.name.trim() !== existing.name && existing.students + existing.supervisors > 0;

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={existing ? "Edit company" : "Add company"}
      description={
        existing
          ? undefined
          : "Students and supervisors that already carry this name are linked to it."
      }
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : existing ? "Save changes" : "Add company"}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={submit} className="space-y-4">
        <FormField label="Company name" htmlFor="company-name">
          <input
            id="company-name"
            type="text"
            required
            maxLength={150}
            value={form.name}
            onChange={(event) => set("name")(event.target.value)}
            className="field"
          />
        </FormField>
        {renaming && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20">
            Renaming changes the company shown on its {existing.students} student
            {existing.students === 1 ? "" : "s"} and {existing.supervisors} supervisor
            {existing.supervisors === 1 ? "" : "s"} as well.
          </p>
        )}
        <FormField label="Address" htmlFor="company-address" optional>
          <input
            id="company-address"
            type="text"
            maxLength={300}
            value={form.address}
            onChange={(event) => set("address")(event.target.value)}
            className="field"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Contact person" htmlFor="company-contact" optional>
            <input
              id="company-contact"
              type="text"
              maxLength={150}
              value={form.contact_person}
              onChange={(event) => set("contact_person")(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Contact phone" htmlFor="company-phone" optional>
            <input
              id="company-phone"
              type="tel"
              maxLength={40}
              value={form.contact_phone}
              onChange={(event) => set("contact_phone")(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Industry" htmlFor="company-industry" optional>
            <input
              id="company-industry"
              type="text"
              maxLength={120}
              value={form.industry}
              onChange={(event) => set("industry")(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Website" htmlFor="company-website" optional hint="Starting with https://">
            <input
              id="company-website"
              type="url"
              maxLength={200}
              value={form.website}
              onChange={(event) => set("website")(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormField label="HR contact" htmlFor="company-hr" optional hint="Who handles interns' papers: name, email or phone">
          <input
            id="company-hr"
            type="text"
            maxLength={150}
            value={form.hr_contact}
            onChange={(event) => set("hr_contact")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Contact email" htmlFor="company-email" optional>
          <input
            id="company-email"
            type="email"
            maxLength={200}
            value={form.contact_email}
            onChange={(event) => set("contact_email")(event.target.value)}
            className="field"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Agreement starts" htmlFor="company-moa-start" optional>
            <input
              id="company-moa-start"
              type="date"
              value={form.moa_start}
              onChange={(event) => set("moa_start")(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Agreement ends" htmlFor="company-moa-expiry" optional>
            <input
              id="company-moa-expiry"
              type="date"
              value={form.moa_expiry}
              onChange={(event) => set("moa_expiry")(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Intern places" htmlFor="company-slots" optional>
            <input
              id="company-slots"
              type="number"
              min={0}
              step={1}
              value={form.slots}
              onChange={(event) => set("slots")(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
