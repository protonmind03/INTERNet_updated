import { useState, type ReactNode } from "react";
import Icon, { type IconName } from "../../../components/Icon";
import { Button } from "../../../components/ui";
import { toast } from "../../../lib/toast";

/*
| Small pieces shared by the record's overview and its sections.
*/

/** Approve and reject, side by side. Busy while the approval is saved, so a second click cannot send it twice. */
export function DecideButtons({
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
  online,
}: {
  approveLabel: string;
  rejectLabel: string;
  onApprove: () => Promise<void>;
  onReject: () => void;
  /** Saving needs a connection; offline the buttons say why they do nothing. */
  online: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const offline = () => toast.info("You're offline. This can't be saved until your connection is back.");
  const approve = () => {
    if (!online) return offline();
    setBusy(true);
    void onApprove().finally(() => setBusy(false));
  };
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => (online ? onReject() : offline())}
        disabled={busy}
        aria-disabled={!online || undefined}
        className={`h-8 px-2.5 text-red-700 ${online ? "" : "opacity-50"}`}
      >
        {rejectLabel}
      </Button>
      <Button
        size="sm"
        onClick={approve}
        busy={busy}
        busyProcess="verify"
        aria-disabled={!online || undefined}
        className={`h-8 px-2.5 ${online ? "" : "opacity-50"}`}
      >
        {approveLabel}
      </Button>
    </>
  );
}

/** Copies a value (an email, a number) and says so. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        try {
          navigator.clipboard.writeText(value).then(
            () => toast.success(`Copied ${value}`),
            () => toast.info(value)
          );
        } catch {
          toast.info(value);
        }
      }}
      className="inline-grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-psu-50 hover:text-psu-700 pointer-coarse:h-10 pointer-coarse:w-10"
    >
      <Icon name="copy" size={14} />
    </button>
  );
}

/** A figure at the top of a section. */
export function Tile({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular mt-0.5 text-[22px] font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">{children}</div>;
}

/** A section's own heading inside the folder. */
export function SectionHead({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 max-w-[72ch] text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A small uppercase heading over a group of rows, with its count. */
export function GroupTitle({ children, count }: { children: ReactNode; count: number }) {
  return (
    <p className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
      <span className="tabular rounded-full bg-slate-200 px-2 text-[11px] tracking-normal text-slate-700">{count}</span>
    </p>
  );
}

/** A row of choices that filter a list, each with its count. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number; icon?: IconName }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-[3px] [scrollbar-width:none]"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium pointer-coarse:h-10 ${
              on ? "bg-psu-50 text-psu-900 ring-1 ring-inset ring-psu-600/15" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.icon && <Icon name={option.icon} size={15} />}
            {option.label}
            {option.count !== undefined && (
              <span
                className={`tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${
                  on ? "bg-psu-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
