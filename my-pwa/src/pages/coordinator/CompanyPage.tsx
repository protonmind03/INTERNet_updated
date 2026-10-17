import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Card, CardHeader, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate } from "../../lib/format";
import { errorText } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| ONE COMPANY
|--------------------------------------------------------------------------
|
| Roadmap 5.2. A host company's own page, opened from the Companies tab:
| its details and agreement, the people who supervise there (each with how
| many interns, and a link to their page), and the coordinator's visits,
| with Log visit.
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
  industry: string | null;
  website: string | null;
  hr_contact: string | null;
  is_active: boolean;
  students: number;
};
type Supervisor = { supervisor_id: string; name: string; email: string; department: string | null; position: string | null; is_active: boolean; interns: number };
type Visit = { id: number; visit_date: string; visited_by_name: string; findings: string; follow_up: string | null };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export default function CompanyPage() {
  const { companyId = "" } = useParams();
  const [data, setData] = useState<{ company: Company; supervisors: Supervisor[]; visits: Visit[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await coordinatorRequest(`/api/coordinator/company-records/${encodeURIComponent(companyId)}/page`));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the company."));
    }
  }, [companyId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const company = data?.company;
  const back = (
    <Link to="/coordinator/companies" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-psu-700 hover:underline">
      <Icon name="chevron-left" size={16} />
      All companies
    </Link>
  );

  return (
    <CoordinatorLayout title={company?.name ?? "Company"} subtitle={company?.industry ?? undefined} actions={back}>
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}
        {!data && !error && (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        )}
        {company && data && (
          <>
            <Card>
              <CardHeader title="Details and agreement" />
              <dl className="grid gap-x-6 gap-y-4 px-4 pb-5 pt-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
                <Fact label="Agreement">
                  <span className="flex flex-wrap items-center gap-2">
                    {company.moa_start || company.moa_expiry
                      ? `${company.moa_start ? formatDate(company.moa_start) : "?"} to ${company.moa_expiry ? formatDate(company.moa_expiry) : "?"}`
                      : "No dates recorded"}
                    {!company.is_active && <StatusBadge status="Inactive" tone="neutral" />}
                  </span>
                </Fact>
                <Fact label="Places">
                  {company.slots === null ? `${company.students} active interns` : `${company.students} of ${company.slots} taken`}
                </Fact>
                <Fact label="Industry">{company.industry}</Fact>
                <Fact label="Main office">{company.address}</Fact>
                <Fact label="Contact">
                  {[company.contact_person, company.contact_email, company.contact_phone].filter(Boolean).join(" · ")}
                </Fact>
                <Fact label="HR contact">{company.hr_contact}</Fact>
                <Fact label="Website">
                  {company.website && (
                    <a href={company.website} target="_blank" rel="noreferrer noopener" className="font-semibold text-psu-700 hover:underline">
                      {company.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </Fact>
              </dl>
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:px-5">
                To change these, use Edit on the{" "}
                <Link to="/coordinator/companies" className="font-semibold text-psu-700 hover:underline">
                  Companies
                </Link>{" "}
                list.
              </p>
            </Card>

            <Card>
              <CardHeader title="Supervisors" description="Who supervises interns here, and how many each has." />
              {data.supervisors.length === 0 ? (
                <EmptyState icon="users" title="No supervisors linked to this company" />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {data.supervisors.map((supervisor) => (
                    <li key={supervisor.supervisor_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                      <span className="min-w-0">
                        <Link
                          to={`/coordinator/supervisors/${encodeURIComponent(supervisor.supervisor_id)}`}
                          className="font-semibold text-psu-800 hover:underline"
                        >
                          {supervisor.name}
                        </Link>
                        <span className="block text-xs text-slate-600">
                          {[supervisor.position, supervisor.department, supervisor.email].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="tabular">
                          {supervisor.interns} {supervisor.interns === 1 ? "intern" : "interns"}
                        </span>
                        {!supervisor.is_active && <StatusBadge status="Deactivated" tone="neutral" />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Visits"
                description="The coordinator's visits to this company, newest first."
                action={
                  <Link
                    to={`/coordinator/companies?tab=site-visits&company=${company.id}&log=1`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-psu-700 px-3 text-sm font-semibold text-white hover:bg-psu-800"
                  >
                    <Icon name="plus" size={16} />
                    Log visit
                  </Link>
                }
              />
              {data.visits.length === 0 ? (
                <EmptyState icon="building" title="No visits logged yet" />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {data.visits.map((visit) => (
                    <li key={visit.id} className="px-4 py-3 sm:px-5">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatDate(visit.visit_date)}
                        <span className="font-normal text-slate-600"> · {visit.visited_by_name}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{visit.findings}</p>
                      {visit.follow_up && (
                        <p className="mt-1 text-sm text-slate-600">
                          <span className="font-semibold">Follow up:</span> {visit.follow_up}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </CoordinatorLayout>
  );
}
