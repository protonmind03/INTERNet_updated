import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import RoadGlyph, { CapGlyph, CheckGlyph } from "./RoadGlyph";
import { BRAND } from "./geometry";
import { ROLE_THEMES, errorText, getActiveRole, messageFor, successFor } from "./roles";
import type { BrandRole, LoadProcess } from "./roles";

/* ======================================================================
   Toasts — one place where every action reports back to the user
   ====================================================================== */

export type ToastTone = "working" | "success" | "error" | "info";
export type ToastInput = {
  tone: ToastTone;
  title: string;
  detail?: string;
  /** ms before it closes by itself. Working toasts stay until updated. */
  duration?: number;
  /** Brand moment: success shows the graduation cap instead of a check. */
  celebrate?: boolean;
  action?: { label: string; onClick: () => void };
};
type Toast = ToastInput & { id: number; leaving?: boolean };
type ToastApi = {
  show: (t: ToastInput) => number;
  update: (id: number, patch: Partial<ToastInput>) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

/** Mount once near the root (inside the router so it survives page changes). */
export function BrandToastProvider({ role, children }: { role?: BrandRole; children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 200);
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const arm = useCallback(
    (t: Toast) => {
      const old = timers.current.get(t.id);
      if (old) window.clearTimeout(old);
      if (t.tone === "working") return;
      const ms = t.duration ?? (t.tone === "error" ? 6000 : 3200);
      timers.current.set(t.id, window.setTimeout(() => dismiss(t.id), ms));
    },
    [dismiss],
  );

  const show = useCallback(
    (input: ToastInput) => {
      const t: Toast = { ...input, id: ++seq.current };
      setToasts((all) => [...all.slice(-2), t]);
      arm(t);
      return t.id;
    },
    [arm],
  );

  const update = useCallback(
    (id: number, patch: Partial<ToastInput>) => {
      setToasts((all) =>
        all.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          arm(next);
          return next;
        }),
      );
    },
    [arm],
  );

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} role={role} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useBrandToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (ctx) return ctx;
  // Works without the provider (no-op) so pages never crash if it is not mounted yet.
  return { show: () => 0, update: () => {}, dismiss: () => {} };
}

function ToastStack({ toasts, role, onDismiss }: { toasts: Toast[]; role?: BrandRole; onDismiss: (id: number) => void }) {
  const r = role ?? getActiveRole();
  const t = ROLE_THEMES[r];
  const dark = t.surface === "dark";
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:items-end md:pb-6"
    >
      {toasts.map((toast) => {
        const isError = toast.tone === "error";
        const bg = isError ? "#FFFFFF" : dark ? t.colors.surface : "#FFFFFF";
        const fg = isError ? "#0F172A" : dark ? "#FFFFFF" : "#0F172A";
        const sub = isError ? "#475569" : dark ? "#C7CDF0" : "#475569";
        const accent = isError ? "#DC2626" : dark ? BRAND.amber : t.colors.accent;
        return (
          <div
            key={toast.id}
            role={isError ? "alert" : "status"}
            className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl shadow-xl ${toast.leaving ? "inb-toast-out" : "inb-toast-in"}`}
            style={{ background: bg, color: fg, border: dark && !isError ? "none" : "1px solid #E2E8F0", boxShadow: isError ? "inset 3px 0 0 #DC2626, 0 20px 25px -5px rgba(0,0,0,.15)" : undefined }}
          >
            <div className="flex items-start gap-3 p-3.5 pr-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: isError ? "#FEF2F2" : dark ? "rgba(250,204,21,.16)" : t.colors.tagBg, color: accent }}>
                {toast.tone === "working" && <RoadGlyph size={16} color={accent} />}
                {toast.tone === "success" && (toast.celebrate ? <CapGlyph size={18} color={dark ? "#FFFFFF" : BRAND.navy} /> : <CheckGlyph size={16} color={accent} />)}
                {toast.tone === "error" && <span className="text-sm font-bold" aria-hidden="true">!</span>}
                {toast.tone === "info" && <span className="h-2 w-2 rounded-full" style={{ background: accent }} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 text-[13px] leading-snug" style={{ color: sub }}>{toast.detail}</p>}
                {toast.action && (
                  <button type="button" onClick={toast.action.onClick} className="mt-2 text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: accent }}>
                    {toast.action.label}
                  </button>
                )}
              </div>
              {toast.tone !== "working" && (
                <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100" style={{ color: fg }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {toast.tone !== "working" && (
              <span
                className="inb-countdown absolute bottom-0 left-0 h-0.5 w-full"
                style={{ background: accent, opacity: 0.6, animationDuration: `${toast.duration ?? (isError ? 6000 : 3200)}ms` }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ======================================================================
   useBrandAction — wrap any async action (fetch/POST/PUT) to get
   consistent working → success / error feedback.
   ====================================================================== */

export type ActionState = "idle" | "working" | "success" | "error";
type ActionOptions = {
  role?: BrandRole;
  process: LoadProcess;
  /** Success sentence. Be specific when you can: "Attendance approved for Demo Student." */
  success?: string | ((result: unknown) => string);
  /** Extra line under the success title. */
  successDetail?: string;
  /** Error sentence override. By default the thrown message (or a friendly network message). */
  error?: string;
  /** Show toasts (default true). Set false for tiny inline actions where the button state is enough. */
  toast?: boolean;
  /** Brand moment: success toast shows the graduation cap. */
  celebrate?: boolean;
};

export function useBrandAction(opts: ActionOptions) {
  const { show, update } = useBrandToast();
  const [state, setState] = useState<ActionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const reset = useRef<number | undefined>(undefined);
  const role = opts.role ?? getActiveRole();

  useEffect(() => () => window.clearTimeout(reset.current), []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
      window.clearTimeout(reset.current);
      setState("working");
      setError(null);
      let toastId = 0;
      // Only show a "working" toast when the action takes long enough to notice.
      const slow = opts.toast !== false ? window.setTimeout(() => { toastId = show({ tone: "working", title: messageFor(role, opts.process) }); }, 450) : undefined;
      try {
        const result = await fn();
        window.clearTimeout(slow);
        const title = typeof opts.success === "function" ? opts.success(result) : opts.success ?? successFor(role, opts.process);
        if (opts.toast !== false) {
          const patch = { tone: "success" as const, title, detail: opts.successDetail, celebrate: opts.celebrate };
          if (toastId) update(toastId, patch); else show(patch);
        }
        setState("success");
        reset.current = window.setTimeout(() => setState("idle"), 1800);
        return result;
      } catch (err) {
        window.clearTimeout(slow);
        const msg = opts.error ?? errorText(err);
        setError(msg);
        if (opts.toast !== false) {
          const patch = { tone: "error" as const, title: msg };
          if (toastId) update(toastId, patch); else show(patch);
        }
        setState("error");
        reset.current = window.setTimeout(() => setState("idle"), 2400);
        return undefined;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, opts.process, opts.success, opts.successDetail, opts.error, opts.toast, opts.celebrate, show, update],
  );

  return { state, error, run, busy: state === "working" };
}

/* ======================================================================
   ActionButton — the button that shows what is happening.
   ====================================================================== */

type ActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> &
  ActionOptions & {
    /** The work. Throw (or reject) to show the error state. Fetch callers: throw when !res.ok. */
    onAction: () => Promise<unknown> | unknown;
    children: ReactNode;
    /** Label while working. Defaults to the role message for `process`, shortened. */
    busyLabel?: string;
    /** Short label shown for ~1.8s after success, e.g. "Timed in", "Approved", "Saved". */
    doneLabel?: string;
    intent?: "primary" | "secondary" | "danger" | "success";
    size?: "sm" | "md" | "lg";
  };

export function ActionButton({
  onAction,
  children,
  busyLabel,
  doneLabel = "Done",
  intent = "primary",
  size = "md",
  role,
  process,
  success,
  successDetail,
  error,
  toast,
  celebrate,
  className = "",
  disabled,
  type = "button",
  ...rest
}: ActionButtonProps) {
  const r = role ?? getActiveRole();
  const t = ROLE_THEMES[r];
  const { state, run } = useBrandAction({ role: r, process, success, successDetail, error, toast, celebrate });
  const pad = size === "sm" ? "px-3 py-2 text-[13px]" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm";
  const palette =
    intent === "primary"
      ? { background: t.colors.accent, color: t.colors.accentText, border: "1px solid transparent" }
      : intent === "danger"
        ? { background: "#DC2626", color: "#FFFFFF", border: "1px solid transparent" }
        : intent === "success"
          ? { background: "#047857", color: "#FFFFFF", border: "1px solid transparent" }
          : { background: "#FFFFFF", color: "#334155", border: "1px solid #E2E8F0" };
  const label = state === "working" ? busyLabel ?? shorten(messageFor(r, process)) : state === "success" ? doneLabel : children;

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || state === "working"}
      aria-busy={state === "working"}
      onClick={() => void run(onAction)}
      className={`inb-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-80 ${pad} ${state === "error" ? "inb-shake" : ""} ${className}`}
      style={palette}
    >
      {state === "working" && <RoadGlyph size={18} />}
      {state === "success" && (celebrate ? <CapGlyph size={20} color="currentColor" tassel={intent === "primary" && t.surface === "dark" ? BRAND.navy : BRAND.amber} /> : <CheckGlyph size={18} />)}
      <span>{label}</span>
    </button>
  );
}

function shorten(msg: string) {
  // "Recording your time-in photo…" → "Recording time-in…" style: keep it short on buttons.
  const m = msg.replace(/\byour\s+/gi, "").replace(/\s+(from|to|for)\s+.*…$/i, "…");
  return m.length > 26 ? `${m.split(" ").slice(0, 3).join(" ").replace(/…?$/, "…")}` : m;
}

/* ======================================================================
   RouteProgress — thin amber bar on every page change
   ====================================================================== */

/** Render once in the app shell: <RouteProgress trigger={location.pathname} />. */
export function RouteProgress({ trigger, color = BRAND.amber }: { trigger: string; color?: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[95] h-[3px]">
      <div key={trigger} className="inb-route h-full w-full" style={{ background: color }} />
    </div>
  );
}
