import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Icon, { type IconName } from "./Icon";
import { TONE_TILE, type Tone } from "./tones";
import { BrandLoader, CheckGlyph, type LoadProcess } from "../brand";

/*
|--------------------------------------------------------------------------
| SHARED UI PIECES
|--------------------------------------------------------------------------
|
| Small building blocks used by every portal, so a status, a button, or a
| dialog looks and behaves the same wherever it appears.
|
*/

/*
|--------------------------------------------------------------------------
| BUTTON
|--------------------------------------------------------------------------
*/

const BUTTON_VARIANTS = {
  // Flat fills (PSU redesign 13.1): the role's accent (the psu-* scale follows the role,
  // brand.css), and gold for the one thing to do now.
  primary: "bg-psu-600 text-white hover:bg-psu-700 active:bg-psu-800",
  gold: "bg-gold-400 text-psu-950 hover:bg-gold-300 active:bg-gold-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  // The outlined choice beside a solid main action (Reject beside Verify, Appeal beside Retake).
  outline: "border-[1.5px] border-psu-600 bg-white text-psu-700 hover:bg-psu-50 active:bg-psu-100",
  ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 gap-1.5 px-3 text-xs",
  md: "h-11 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-base",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  icon?: IconName;
  busy?: boolean;
  /** What the button is doing while busy; read out to screen readers. */
  busyProcess?: LoadProcess;
  /** Replaces the label while busy, e.g. "Saving". */
  busyLabel?: string;
  /** Shown with a check for a moment after the work succeeds, e.g. "Saved". */
  doneLabel?: string;
  /** True when the work just ended in an error; the button shakes once. */
  failed?: boolean;
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  busy = false,
  busyProcess = "save",
  busyLabel,
  doneLabel,
  failed = false,
  block = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  // When the work ends, the button reports how it went: a check and the
  // done label, or a shake when the caller says it failed.
  const [wasBusy, setWasBusy] = useState(busy);
  const [outcome, setOutcome] = useState<"done" | "failed" | null>(null);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    setOutcome(busy ? null : failed ? "failed" : doneLabel ? "done" : null);
  }

  useEffect(() => {
    if (!outcome) return;
    const timer = window.setTimeout(() => setOutcome(null), outcome === "done" ? 1800 : 400);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const done = outcome === "done";

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inb-press inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${
        done ? "" : "disabled:opacity-50"
      } ${
        BUTTON_VARIANTS[variant]
      } ${BUTTON_SIZES[size]} ${block ? "w-full" : ""} ${
        outcome === "failed" ? "inb-shake" : ""
      } ${className}`}
      {...rest}
    >
      {busy ? (
        <BrandLoader variant="button" process={busyProcess} />
      ) : done ? (
        <CheckGlyph size={size === "lg" ? 19 : 16} />
      ) : (
        icon && <Icon name={icon} size={size === "lg" ? 19 : 16} />
      )}
      {busy && busyLabel ? busyLabel : done ? doneLabel : children}
    </button>
  );
}

/*
|--------------------------------------------------------------------------
| STATUS BADGE
|--------------------------------------------------------------------------
|
| Every status word in the system maps to one of four meanings. The dot
| plus the word carry the meaning, so it never depends on colour alone.
|
*/

type StatusTone = "good" | "waiting" | "bad" | "neutral" | "info";

// Status colours are never the role colour (PSU redesign 13.6): green is done, sky is
// pending or for information, red needs someone. brand.css draws them (.st-badge--*); on the
// supervisor's pages "done" is grey with a tick, since green is that portal's own colour.
const STATUS_TONES: Record<StatusTone, string> = {
  good: "st-badge--good",
  waiting: "st-badge--info",
  bad: "st-badge--bad",
  info: "st-badge--info",
  neutral: "st-badge--neutral",
};

const STATUS_MEANINGS: Record<string, StatusTone> = {
  verified: "good",
  approved: "good",
  completed: "good",
  reviewed: "good",
  resolved: "good",
  active: "good",
  pending: "waiting",
  submitted: "waiting",
  "under review": "waiting",
  "for review": "waiting",
  "in progress": "info",
  open: "info",
  rejected: "bad",
  flagged: "bad",
  overdue: "bad",
  "needs revision": "bad",
  missing: "bad",
  dismissed: "neutral",
  inactive: "neutral",
  "not started": "neutral",
};

function statusTone(status: string | null | undefined): StatusTone {
  return STATUS_MEANINGS[(status || "").trim().toLowerCase()] ?? "neutral";
}

export function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone?: StatusTone;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={`st-badge ${STATUS_TONES[resolved]}`}
    >
      <span className="st-badge-mark" aria-hidden="true" />
      {status}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| COUNT BADGE
|--------------------------------------------------------------------------
*/

/** The small number beside a navigation link; nothing is shown for zero. */
export function CountBadge({
  count,
  tone = "light",
  className = "",
}: {
  count: number | undefined;
  /** "dark" for dark backgrounds, "light" for white ones. */
  tone?: "light" | "dark";
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={`tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none ${
        tone === "dark" ? "bg-gold-400 text-psu-950" : "bg-red-600 text-white"
      } ${className}`}
      aria-label={`${count} waiting`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| CARD
|--------------------------------------------------------------------------
*/

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`card-hairline rounded-xl ${className}`}
    >
      {children}
    </section>
  );
}

/*
|--------------------------------------------------------------------------
| TONES AND ICON TILES (system pass)
|--------------------------------------------------------------------------
|
| One meaning per colour, everywhere: brand is the role's own colour for
| plain subjects; info, success, warning and danger are the status colours
| (never a role colour, and always with words beside them); neutral is
| for what needs nothing. A tone tints an icon tile, a card's accent, a
| meter or a summary tile, so a page can be scanned by colour and read by
| its words.
|
*/

/** A rounded square with an icon in a tone: the subject of a card, a figure or a row at a glance. */
export function IconTile({ icon, tone = "brand", size = "md", className = "" }: { icon: IconName; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-xl" : "h-10 w-10 rounded-xl";
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center ${box} ${TONE_TILE[tone]} ${className}`}>
      <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 22 : 19} />
    </span>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  tone = "brand",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** The card's subject as an icon tile beside its title. */
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />}
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-slate-600">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STAT TILE
|--------------------------------------------------------------------------
*/

// The icon chip takes the brand blue or gold for plain figures. The status
// tones are only for tiles that report a status, so colour keeps its meaning.
const TILE_TONES = {
  brand: "bg-psu-50 text-psu-700 ring-psu-600/10",
  gold: "bg-gold-50 text-gold-700 ring-gold-600/20",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  waiting: "bg-amber-50 text-amber-700 ring-amber-600/20",
  bad: "bg-red-50 text-red-600 ring-red-600/15",
  neutral: "bg-slate-100 text-slate-500 ring-slate-500/10",
} as const;

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: keyof typeof TILE_TONES;
  /** While the figure loads: placeholders where the number and its line will be, so nothing moves when they arrive. */
  loading?: boolean;
}) {
  return (
    <div className="card-hairline rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TILE_TONES[tone]}`}
          >
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      {loading ? (
        <>
          <span className="mt-1.5 flex h-8 items-center" aria-hidden="true">
            <Skeleton className="h-6 w-14" />
          </span>
          <span className="mt-0.5 flex h-4 items-center" aria-hidden="true">
            <Skeleton className="h-3 w-24" />
          </span>
        </>
      ) : (
        <>
          <p className="tabular font-display mt-1.5 text-[28px] font-bold leading-tight text-slate-900">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PROGRESS
|--------------------------------------------------------------------------
*/

export function ProgressBar({
  value,
  className = "",
  label,
}: {
  /** 0–100 */
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label ?? `${Math.round(clamped)} percent`}
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
    >
      <div
        className="h-full rounded-full bg-psu-600 transition-[width] duration-500 ease-soft"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 132,
  stroke = 11,
  children,
  label,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          stroke="var(--color-psu-600)"
          className="transition-[stroke-dashoffset] duration-700 ease-soft"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| LOADING AND EMPTY STATES
|--------------------------------------------------------------------------
*/

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-skeleton rounded-md bg-slate-200/70 ${className}`} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "info",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-psu-50 text-psu-600 ring-1 ring-inset ring-psu-600/15">
        <Icon name={icon} size={20} />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A full-width notice for a failed load, with a way to try again. */
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <Icon name="alert" className="shrink-0 text-red-500" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-2 py-1 text-sm font-semibold text-red-700 underline-offset-2 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| MODAL AND CONFIRM DIALOG
|--------------------------------------------------------------------------
|
| On phones a modal slides up from the bottom as a sheet, where thumbs can
| reach it; on larger screens it is a centred dialog.
|
*/

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  locked = false,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** While true the dialog cannot be dismissed (a request is in flight). */
  locked?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, locked, onClose]);

  // Iteration 21: focus moves into the dialog, Tab stays inside it, and it
  // goes back to what had it when the dialog closes.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
    const frame = window.requestAnimationFrame(() => {
      if (dialog && !dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    });
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onTab);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open]);

  // A body taller than the sheet scrolls; then it takes a Tab stop, so the arrow keys can scroll
  // it when nothing inside can take focus (WCAG 2.1.1). It is no stop while it all fits.
  const [bodyScrolls, setBodyScrolls] = useState(false);
  const bodyRef = useCallback((element: HTMLDivElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setBodyScrolls(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Content that grows once the sheet is at its full height does not resize the body itself.
    const changes = new MutationObserver(measure);
    changes.observe(element, { childList: true, subtree: true });
    measure();
    return () => {
      observer.disconnect();
      changes.disconnect();
    };
  }, []);

  if (!open) return null;

  const width = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl" }[size];

  return (
    <div
      // The page behind is dimmed and softened, so the dialog reads as the one thing to attend to.
      className="modal-backdrop fixed inset-0 z-(--z-modal) flex animate-fade-in items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-2xl bg-white shadow-2xl sm:animate-dialog-in sm:rounded-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-(--role-hairline) bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={locked}
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <Icon name="close" />
          </button>
        </div>
        {children && (
          <div
            ref={bodyRef}
            tabIndex={bodyScrolls ? 0 : undefined}
            role={bodyScrolls ? "region" : undefined}
            aria-label={bodyScrolls ? title : undefined}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-psu-600"
          >
            {children}
          </div>
        )}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  busyProcess = "save",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger" | "gold";
  busy?: boolean;
  /** What the button is doing while busy; read out to screen readers. */
  busyProcess?: LoadProcess;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      locked={busy}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} busy={busy} busyProcess={busyProcess}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/*
|--------------------------------------------------------------------------
| FORM PIECES
|--------------------------------------------------------------------------
*/

/** A labelled form control with an optional hint underneath. */
export function FormField({
  label,
  htmlFor,
  hint,
  optional = false,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="font-normal text-slate-500"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A form-level error message. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
      <input
        type="search"
        maxLength={100}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field pl-9"
      />
    </label>
  );
}

/** Initials in a circle, for lists of people. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .filter((_, index, parts) => index === 0 || index === parts.length - 1)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-psu-100 font-semibold text-psu-800 ring-1 ring-inset ring-psu-600/15 ${
        size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-xs"
      }`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| ROW MENU
|--------------------------------------------------------------------------
|
| The less common actions on a table row, behind one "more" button. It
| keeps a long table from repeating the same links on every line, and
| keeps an action like "Deactivate" a deliberate step away from "Edit".
|
*/

export type RowMenuItem = {
  label: string;
  icon?: IconName;
  tone?: "danger" | "good";
  onSelect: () => void;
};

export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [place, setPlace] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = place !== null;

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setPlace(null);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    // The menu is placed against the button, so it closes if the page moves.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (items.length === 0) return null;

  const toggle = () => {
    if (open || !buttonRef.current) return setPlace(null);
    const box = buttonRef.current.getBoundingClientRect();
    // Opens upward when there is not enough room underneath.
    const up = window.innerHeight - box.bottom < items.length * 44 + 24;
    setPlace({
      top: up ? box.top - 6 : box.bottom + 6,
      right: Math.max(8, window.innerWidth - box.right),
      up,
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`-my-1.5 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${
          open ? "bg-slate-100 text-slate-800" : ""
        }`}
      >
        <Icon name="more" size={18} />
      </button>
      {place &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{
              top: place.top,
              right: place.right,
              transform: place.up ? "translateY(-100%)" : undefined,
            }}
            className="fixed z-(--z-menu) w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-raised"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlace(null);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium ${
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : item.tone === "good"
                      ? "text-emerald-700 hover:bg-emerald-50"
                      : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.icon && <Icon name={item.icon} size={16} className="shrink-0 opacity-80" />}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/*
|--------------------------------------------------------------------------
| STAR RATINGS
|--------------------------------------------------------------------------
*/

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** A read-only row of five stars. */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${filled} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={size}
          className={star <= filled ? "fill-gold-400 text-gold-500" : "text-slate-300"}
        />
      ))}
    </span>
  );
}

/** Five stars to pick a rating from; clicking the chosen star again clears it. */
export function StarInput({
  value,
  onChange,
  label,
  size = 28,
  clearable = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  size?: number;
  clearable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? "star" : "stars"}, ${RATING_WORDS[star]}`}
          onClick={() => onChange(clearable && value === star ? 0 : star)}
          className="rounded-md p-0.5"
        >
          <Icon
            name="star"
            size={size}
            className={star <= value ? "fill-gold-400 text-gold-500" : "text-slate-300"}
          />
        </button>
      ))}
      <span className="ml-2 text-sm font-medium text-slate-700">{RATING_WORDS[value]}</span>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| FILTER CHIPS
|--------------------------------------------------------------------------
*/

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
              active
                ? "bg-psu-600 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={`tabular rounded-full px-1.5 text-xs ${
                  active ? "bg-white/20" : "bg-slate-100 text-slate-600"
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
