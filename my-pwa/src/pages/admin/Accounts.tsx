import { useEffect, useState } from "react";
import Icon from "../../components/Icon";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, FormError, FormField, RowMenu, SearchField, SkeletonRows, StatusBadge, type RowMenuItem } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { CAMPUSES, HOME_CAMPUS, staffIdShape, type CampusCode } from "../../lib/campuses";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { adminRequest } from "./request";

/*
| Accounts (Phase 1.7): every kind of account by name, email or ID, and the
| few things the administrator may do to one. Each opens a confirmation
| that names the account and what will happen. Who an account is, never
| what is in it: the server sends kind, ID, name, email and state only.
*/

type Kind = "student" | "supervisor" | "coordinator" | "director" | "admin";
type Account = { role: Kind; id: string; name: string; email: string; is_active: boolean; locked: boolean; must_change_password: boolean };
type Action = "unlock" | "end_sessions" | "deactivate" | "reactivate" | "temporary_password";

const KIND_NAMES: Record<Kind, string> = {
  student: "Student",
  supervisor: "Supervisor",
  coordinator: "Coordinator",
  director: "OJT Director",
  admin: "Administrator",
};

const KIND_FILTER = [
  { value: "", label: "Every kind" },
  { value: "student", label: "Students" },
  { value: "supervisor", label: "Supervisors" },
  { value: "coordinator", label: "Coordinators" },
  { value: "director", label: "OJT Directors" },
  { value: "admin", label: "Administrators" },
] as const;

/** What each action does, said before it is done, and the button that does it. */
const ACTIONS: Record<Action, { verb: string; effect: (account: Account) => string; danger: boolean }> = {
  unlock: {
    verb: "Unlock",
    effect: (a) => `Lift the sign-in lockout on ${a.name} (${KIND_NAMES[a.role].toLowerCase()}). They can try their password again at once.`,
    danger: false,
  },
  temporary_password: {
    verb: "Email a temporary password",
    effect: (a) =>
      `Email a temporary password to ${a.name} (${KIND_NAMES[a.role].toLowerCase()}) at ${a.email}. Their current password stops working and every session ends. You will not see the password.`,
    danger: true,
  },
  end_sessions: {
    verb: "End sessions",
    effect: (a) => `End every session of ${a.name} (${KIND_NAMES[a.role].toLowerCase()}). They will have to sign in again.`,
    danger: true,
  },
  deactivate: {
    verb: "Deactivate",
    effect: (a) => `Deactivate ${a.name} (${KIND_NAMES[a.role].toLowerCase()}). They can no longer sign in, and every session ends.`,
    danger: true,
  },
  reactivate: {
    verb: "Reactivate",
    effect: (a) => `Reactivate ${a.name} (${KIND_NAMES[a.role].toLowerCase()}). They can sign in again with their password.`,
    danger: false,
  },
};

const selectClass = "field";

export default function AdminAccounts() {
  const me = useAccount("admin");
  const [words, setWords] = useState("");
  const [kind, setKind] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<{ account: Account; action: Action } | null>(null);
  const [acting, setActing] = useState(false);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams();
      if (words.trim()) query.set("q", words.trim());
      if (kind) query.set("role", kind);
      adminRequest<{ accounts: Account[] }>(`/api/admin/accounts?${query}`, { signal: controller.signal })
        .then((data) => {
          setAccounts(data.accounts);
          setError("");
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) setError(errorText(loadError, "The accounts could not be loaded."));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [words, kind, reload]);

  const act = async () => {
    if (!pending) return;
    setActing(true);
    try {
      const data = await adminRequest<{ message: string }>(
        `/api/admin/accounts/${pending.account.role}/${encodeURIComponent(pending.account.id)}`,
        { method: "POST", body: { action: pending.action } }
      );
      toast.success(data.message);
      setPending(null);
      setReload((value) => value + 1);
    } catch (actError) {
      toast.error(errorText(actError, "The account could not be changed."));
    } finally {
      setActing(false);
    }
  };

  const isMe = (account: Account) => account.role === "admin" && account.id === me?.admin_id;
  const menuFor = (account: Account): RowMenuItem[] => {
    const ask = (action: Action) => () => setPending({ account, action });
    if (isMe(account)) return account.locked ? [{ label: "Unlock", icon: "lock", onSelect: ask("unlock") }] : [];
    return [
      ...(account.locked ? [{ label: "Unlock", icon: "lock" as const, onSelect: ask("unlock") }] : []),
      ...(account.is_active ? [{ label: "Email a temporary password", icon: "mail" as const, onSelect: ask("temporary_password") }] : []),
      { label: "End every session", icon: "logout", onSelect: ask("end_sessions") },
      account.is_active
        ? { label: "Deactivate", icon: "ban", tone: "danger", onSelect: ask("deactivate") }
        : { label: "Reactivate", icon: "check", tone: "good", onSelect: ask("reactivate") },
    ];
  };

  return (
    <AdminLayout
      title="Accounts"
      actions={
        <Button icon="plus" onClick={() => setMaking(true)}>
          New account
        </Button>
      }
    >
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-inset ring-(--role-hairline)">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-psu-700" />
        This portal cannot open students' records, documents, photos or grades.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchField label="Search accounts" placeholder="Name, email or ID" value={words} onChange={setWords} />
        <label className="block">
          <span className="sr-only">Kind of account</span>
          <select className={selectClass} value={kind} onChange={(event) => setKind(event.target.value)}>
            {KIND_FILTER.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : accounts === null ? (
        <Card className="p-4">
          <SkeletonRows rows={5} />
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="No account matches"
            description="Check the spelling, or search by email or ID. Coordinators make students and supervisors; the OJT Director makes coordinators."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
            {accounts.length === 25 ? "The first 25 matches. Type more to narrow them." : `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
          </p>
          <table className="hidden w-full text-left text-sm md:table">
            <caption className="sr-only">Accounts</caption>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Kind</th>
                <th scope="col" className="px-4 py-2.5 font-medium">ID</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                <th scope="col" className="px-4 py-2.5 font-medium">State</th>
                <th scope="col" className="w-14 px-2 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((account) => (
                <tr key={`${account.role}:${account.id}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{account.name}{isMe(account) && <span className="ml-1 font-normal text-slate-500">(you)</span>}</td>
                  <td className="px-4 py-2.5 text-slate-700">{KIND_NAMES[account.role]}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-slate-700">{account.id}</td>
                  <td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-700">{account.email}</td>
                  <td className="px-4 py-2.5"><States account={account} /></td>
                  <td className="px-2 py-1.5 text-right">
                    {menuFor(account).length > 0 && <RowMenu label={`Actions for ${account.name}`} items={menuFor(account)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-slate-100 md:hidden">
            {accounts.map((account) => (
              <li key={`${account.role}:${account.id}`} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{account.name}{isMe(account) && <span className="ml-1 font-normal text-slate-500">(you)</span>}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-600">
                    <span>{KIND_NAMES[account.role]}</span>
                    <span className="font-mono text-[13px]">{account.id}</span>
                  </p>
                  <p className="truncate text-sm text-slate-600">{account.email}</p>
                  <div className="mt-1.5"><States account={account} /></div>
                </div>
                {menuFor(account).length > 0 && <RowMenu label={`Actions for ${account.name}`} items={menuFor(account)} />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `${ACTIONS[pending.action].verb}?` : ""}
        message={pending ? ACTIONS[pending.action].effect(pending.account) : undefined}
        confirmLabel={pending ? ACTIONS[pending.action].verb : ""}
        tone={pending && ACTIONS[pending.action].danger ? "danger" : "primary"}
        busy={acting}
        onConfirm={() => void act()}
        onCancel={() => setPending(null)}
      />
      <NewAccount open={making} onClose={() => setMaking(false)} onMade={() => setReload((value) => value + 1)} />
    </AdminLayout>
  );
}

function States({ account }: { account: Account }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge status={account.is_active ? "Active" : "Deactivated"} tone={account.is_active ? "good" : "neutral"} />
      {account.locked && <StatusBadge status="Locked out" tone="bad" />}
      {account.must_change_password && <StatusBadge status="Must change password" tone="info" />}
    </span>
  );
}

/** A new OJT Director or administrator; the temporary password goes to them by email. */
function NewAccount({ open, onClose, onMade }: { open: boolean; onClose: () => void; onMade: () => void }) {
  const [kind, setKind] = useState<"director" | "admin">("director");
  // An administrator's ID is the year, this campus and its next number (lib/campuses.ts).
  const [campus, setCampus] = useState<CampusCode>(HOME_CAMPUS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "director" ? "OJT Director" : "administrator";

  const close = () => {
    setError("");
    onClose();
  };
  const make = async () => {
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Give the person's full name and email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await adminRequest<{ message: string }>("/api/admin/accounts", { method: "POST", body: { kind, name: name.trim(), email: email.trim(), ...(kind === "admin" ? { campus } : {}) } });
      toast.success(data.message);
      setName("");
      setEmail("");
      onMade();
      onClose();
    } catch (makeError) {
      setError(errorText(makeError, "The account could not be made."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="New account"
      message="Only OJT Director and administrator accounts are made here. Coordinators make students and supervisors; the OJT Director makes coordinators."
      confirmLabel={`Make the ${label} account`}
      busy={busy}
      onConfirm={() => void make()}
      onCancel={close}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Kind of account</legend>
        {(["director", "admin"] as const).map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-slate-800 hover:bg-slate-50">
            <input type="radio" name="new-account-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="h-4 w-4" />
            {value === "director" ? "OJT Director" : "System administrator"}
          </label>
        ))}
      </fieldset>
      <div className="mt-3 space-y-3">
        {kind === "admin" && (
          <FormField label="Campus" htmlFor="new-account-campus" hint={`Their account ID is given in order, such as ${staffIdShape("admin", campus)}.`}>
            <select id="new-account-campus" className="field" value={campus} onChange={(event) => setCampus(event.target.value as CampusCode)}>
              {CAMPUSES.map((one) => (
                <option key={one.code} value={one.code}>
                  {one.name} ({one.code})
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Full name" htmlFor="new-account-name">
          <input id="new-account-name" className="field" maxLength={150} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Email" htmlFor="new-account-email" hint="Their temporary password is emailed here. You will not see it.">
          <input id="new-account-email" type="email" className="field" maxLength={150} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormError message={error} />
      </div>
    </ConfirmDialog>
  );
}
