import { useEffect, useState } from "react";
import Pagination from "../../components/Pagination";
import { Button, Card, EmptyState, ErrorNotice, FormField, SkeletonRows } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { ACTOR_NAMES, AUDIT_GROUPS, describeAction, detailText, RECORD_KINDS, type AuditEntry } from "../../lib/auditWords";
import { formatDateTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { serverPagination } from "../../lib/usePagination";
import { adminDownload, adminRequest } from "./request";

/*
| The audit log, as the administrator sees it (Phase 1.7): every entry,
| theirs included, newest first, and a CSV of what the filters leave. The
| server keeps only the listed facts of each action (services/audit.ts),
| never what a record says. Read-only: nothing here changes an entry.
*/

const PAGE_SIZE = 25;
const ROLES = [
  { value: "", label: "Anyone" },
  { value: "admin", label: "Administrators" },
  { value: "director", label: "OJT Directors" },
  { value: "coordinator", label: "Coordinators" },
  { value: "supervisor", label: "Supervisors" },
  { value: "student", label: "Students" },
] as const;

function recordText(entry: AuditEntry): string {
  if (!entry.entity_id) return "None";
  const kind = RECORD_KINDS.find((item) => item.value && item.value === entry.entity_type)?.label ?? (entry.entity_type ?? "record").replace(/_/g, " ");
  return `${kind} ${entry.entity_id}`;
}

export default function AdminAudit() {
  const [group, setGroup] = useState("");
  const [role, setRole] = useState("");
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);

  const query = new URLSearchParams();
  if (group) query.set("action", group);
  if (role) query.set("actor_role", role);
  if (person.trim()) query.set("person", person.trim());
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const filters = query.toString();

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      adminRequest<{ entries: AuditEntry[]; total: number }>(
        `/api/coordinator/audit?${filters ? `${filters}&` : ""}limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
        { signal: controller.signal }
      )
        .then((data) => {
          setEntries(data.entries);
          setTotal(data.total);
          setError("");
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) setError(errorText(loadError, "The audit log could not be loaded."));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, reload]);

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await adminDownload(`/api/coordinator/audit/export${filters ? `?${filters}` : ""}`, "internet-audit-log.csv");
      toast.success("Audit log exported.");
    } catch (exportError) {
      toast.error(errorText(exportError, "The audit log could not be exported."));
    } finally {
      setExporting(false);
    }
  };

  const pager = serverPagination(entries ?? [], total, page, PAGE_SIZE, setPage);

  return (
    <AdminLayout
      title="Audit log"
      actions={
        <Button variant="secondary" icon="download" busy={exporting} busyProcess="export" onClick={() => void exportCsv()}>
          Export as CSV
        </Button>
      }
    >
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="Category" htmlFor="audit-group">
            <select id="audit-group" className="field" value={group} onChange={(event) => change(setGroup)(event.target.value)}>
              {AUDIT_GROUPS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Done by" htmlFor="audit-role">
            <select id="audit-role" className="field" value={role} onChange={(event) => change(setRole)(event.target.value)}>
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Name or ID" htmlFor="audit-person">
            <input id="audit-person" className="field" maxLength={100} value={person} onChange={(event) => change(setPerson)(event.target.value)} />
          </FormField>
          <FormField label="From" htmlFor="audit-from">
            <input id="audit-from" type="date" className="field" value={from} onChange={(event) => change(setFrom)(event.target.value)} />
          </FormField>
          <FormField label="To" htmlFor="audit-to">
            <input id="audit-to" type="date" className="field" value={to} onChange={(event) => change(setTo)(event.target.value)} />
          </FormField>
        </div>
      </Card>

      {error ? (
        <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : entries === null ? (
        <Card className="p-4"><SkeletonRows rows={6} /></Card>
      ) : entries.length === 0 ? (
        <Card><EmptyState icon="list" title="No entry matches" description="Clear a filter or widen the dates." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const details = detailText(entry.details ?? {});
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-slate-900">{describeAction(entry.action)}</p>
                    <p className="font-mono text-[13px] text-slate-600">{formatDateTime(entry.created_at)}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">
                    {entry.actor_name || entry.actor_id} <span className="text-slate-500">({ACTOR_NAMES[entry.actor_role] ?? entry.actor_role}, <span className="font-mono text-[13px]">{entry.actor_id}</span>)</span>
                  </p>
                  <p className="text-sm text-slate-600">On: {recordText(entry)}</p>
                  {details && <p className="mt-0.5 break-words text-sm text-slate-600">{details}</p>}
                </li>
              );
            })}
          </ul>
          <Pagination state={pager} noun="entry" plural="entries" />
        </Card>
      )}
    </AdminLayout>
  );
}
