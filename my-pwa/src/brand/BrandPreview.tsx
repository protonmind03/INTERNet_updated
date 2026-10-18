import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BrandIcon, BrandLoader, BrandLockup, PortalBrand, PortalHeader, ROLE_THEMES, RouteProgress, SplashScreen, Wordmark } from ".";
// The kit's own toasts, shown only on this development-only page.
import { ActionButton, BrandToastProvider } from "./feedback";
import type { Role } from ".";
import { PrototypeRun } from "./LoadingPrototypes";
import { PROTOTYPES, TIMINGS, useReducedMotion, type Timing } from "./loadingPrototypeData";

const ROLES: Role[] = ["student", "supervisor", "coordinator"];
const CONTEXT: Record<Role, string> = {
  student: "BS Information Technology · Philippine Airlines",
  supervisor: "Philippine Airlines · 6 interns",
  coordinator: "Pangasinan State University · Lingayen Campus",
};
const STATUS: Record<Role, string> = {
  student: "Timed in 8:02 AM",
  supervisor: "3 time-ins to verify",
  coordinator: "4 open concerns",
};
const NAV: Record<Role, string[]> = {
  student: ["Today", "Attendance", "Tasks", "Documents", "Schedule", "Weekly report"],
  supervisor: ["Dashboard", "Attendance", "My Interns", "Tasks", "Documents", "Evaluation"],
  coordinator: ["Dashboard", "Students", "Supervisors", "Monitoring", "Requirements", "Analytics"],
};
const PROCESSES: Record<Role, ("dashboard" | "attendance" | "tasks" | "documents" | "verify" | "interns" | "analytics" | "monitoring" | "search" | "timeIn" | "evaluation" | "export")[]> = {
  student: ["timeIn", "attendance", "tasks", "documents"],
  supervisor: ["attendance", "verify", "interns", "evaluation"],
  coordinator: ["monitoring", "analytics", "search", "export"],
};

function Bell({ dark }: { dark: boolean }) {
  return (
    <button type="button" aria-label="Notifications" className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ color: dark ? "#fff" : "#1A237E", background: dark ? "rgba(255,255,255,.08)" : "#F1F5F9" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    </button>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACTIONS: Record<Role, { label: string; process: "timeIn" | "taskSubmit" | "upload" | "verify" | "evaluation" | "export" | "save" | "students"; busy?: string; done: string; success: string; celebrate?: boolean; intent?: "primary" | "secondary" | "danger" | "success" }[]> = {
  student: [
    { label: "Time in", process: "timeIn", busy: "Recording time-in…", done: "Timed in", success: "Timed in at 8:02 AM. Day 12 on your road.", celebrate: true },
    { label: "Submit task", process: "taskSubmit", done: "Submitted", success: "Task submitted to your supervisor.", intent: "secondary" },
  ],
  supervisor: [
    { label: "Approve", process: "verify", busy: "Approving…", done: "Approved", success: "Attendance approved for Demo Student.", intent: "success" },
    { label: "Return", process: "verify", busy: "Returning…", done: "Returned", success: "Returned to Demo Student with your note.", intent: "secondary" },
  ],
  coordinator: [
    { label: "Export PDF", process: "export", done: "Ready", success: "Analytics PDF ready to download." },
    { label: "Register student", process: "students", busy: "Saving…", done: "Saved", success: "Student account created.", intent: "secondary" },
  ],
};

export default function BrandPreview() {
  const [params] = useSearchParams();
  return (
    <BrandToastProvider>
      {params.get("view") === "loading" ? <LoadingView /> : <PreviewInner />}
    </BrandToastProvider>
  );
}

/*
| Iteration 14: the three loading prototypes (LoadingPrototypes.tsx), side by
| side, or one full screen (`&full=1`) to try on a phone. Only here: none
| of them is wired into sign-in.
*/
function LoadingView() {
  const [params, setParams] = useSearchParams();
  const role = (ROLES as string[]).includes(params.get("role") ?? "") ? (params.get("role") as Role) : "student";
  const timing = (TIMINGS.find((item) => item.id === params.get("timing"))?.id ?? "usual") as Timing;
  const full = PROTOTYPES.find((item) => item.id === params.get("proto") && params.get("full") === "1")?.id ?? null;
  const [run, setRun] = useState(0);
  const [forceCalm, setForceCalm] = useState(params.get("calm") === "1");
  const calm = useReducedMotion(forceCalm);
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setRun((current) => current + 1);
  };
  const replay = () => setRun((current) => current + 1);

  if (full) {
    return (
      <div className="fixed inset-0 bg-white">
        <PrototypeRun key={`${full}-${role}-${timing}-${run}`} prototype={full} role={role} timing={timing} run={run} calm={calm} onRetry={replay} />
        <div className="fixed bottom-3 right-3 flex gap-2">
          <button type="button" onClick={replay} className="h-10 rounded-lg bg-white/90 px-3 text-sm font-semibold text-slate-800 shadow ring-1 ring-slate-300">
            Replay
          </button>
          <button type="button" onClick={() => set("full", null)} className="h-10 rounded-lg bg-white/90 px-3 text-sm font-semibold text-slate-800 shadow ring-1 ring-slate-300">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <BrandLockup size={30} />
          <a href="/brand-preview" className="text-sm font-semibold text-psu-700 underline underline-offset-2">
            Back to the brand kit
          </a>
        </header>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">The loading screen after sign-in</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">
            The three prototypes from roadmap 8.3. P2, the shaped skeleton, was chosen: it is what the app now does after sign-in
            (each first page draws its own shape and fills it in place). P1 and P3 are kept here for comparison. Each plays what
            happens between Sign in and the first page, with the data taking as long as chosen below. On a phone, open one full
            screen.
          </p>
        </div>

        <section aria-label="Settings" className="flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700">Role</legend>
            <div className="mt-1 flex gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === role}
                  onClick={() => set("role", r)}
                  className={`h-10 rounded-lg px-3 text-sm font-semibold ${r === role ? "bg-[#1A237E] text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
                >
                  {ROLE_THEMES[r].portal.replace(" Portal", "")}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="text-xs font-semibold text-slate-700">
            The data takes
            <select
              value={timing}
              onChange={(event) => set("timing", event.target.value)}
              className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800"
            >
              {TIMINGS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={forceCalm} onChange={(event) => setForceCalm(event.target.checked)} className="h-4 w-4" />
            Show as with reduced motion
          </label>
          <button type="button" onClick={replay} className="h-10 rounded-lg bg-psu-700 px-4 text-sm font-semibold text-white">
            Replay all three
          </button>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {PROTOTYPES.map((item) => (
            <section key={item.id} aria-labelledby={`proto-${item.id}`} className="flex flex-col gap-3">
              <div>
                <h2 id={`proto-${item.id}`} className="text-base font-bold">
                  {item.name}
                </h2>
                <p className="text-sm text-slate-700">{item.idea}</p>
                <p className="text-xs text-slate-600">{item.principle}</p>
              </div>
              <div className="mx-auto h-[640px] w-full max-w-[360px] overflow-hidden rounded-[32px] bg-white ring-[8px] ring-slate-900" data-testid={`frame-${item.id}`}>
                <PrototypeRun key={`${item.id}-${role}-${timing}-${run}`} prototype={item.id} role={role} timing={timing} run={run} calm={calm} onRetry={replay} />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("proto", item.id);
                  next.set("full", "1");
                  setParams(next);
                  setRun((current) => current + 1);
                }}
                className="mx-auto h-10 rounded-lg bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-300"
              >
                Open {item.name.split(" · ")[0]} full screen
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewInner() {
  const [role, setRole] = useState<Role>("student");
  const [fail, setFail] = useState(false);
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <RouteProgress trigger={role} />
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <BrandLockup size={34} />
          <a href="/brand-preview?view=loading" className="text-sm font-semibold text-psu-700 underline underline-offset-2">
            Loading prototypes (P1 to P3)
          </a>
          <div className="flex gap-2" role="tablist" aria-label="Role">
            {ROLES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={r === role}
                onClick={() => setRole(r)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${r === role ? "bg-[#1A237E] text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
              >
                {ROLE_THEMES[r].portal}
              </button>
            ))}
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200" aria-label="Real sizes">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "#1A237E" }}><PortalBrand role="student" showTag /></div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-slate-200"><PortalBrand role="coordinator" /></div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: "#121A5E" }}><PortalBrand role="supervisor" showTag size="bar" /></div>
          <div className="flex items-end gap-3">{[24, 32, 40, 44, 48, 64].map((n) => <BrandIcon key={n} size={n} />)}</div>
        </section>

        <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-6 ring-1 ring-slate-200" aria-label="Actions">
          {ACTIONS[role].map((a) => (
            <ActionButton key={a.label} role={role} process={a.process} busyLabel={a.busy} doneLabel={a.done} success={a.success} celebrate={a.celebrate} intent={a.intent}
              onAction={async () => { await wait(1400); if (fail) throw new Error("Couldn’t save. The server didn’t respond — try again."); }}>
              {a.label}
            </ActionButton>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} /> Simulate failure</label>
        </section>

        <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="flex flex-col rounded-2xl p-4" style={{ background: t.colors.surface, border: dark ? "none" : "1px solid #E2E8F0" }}>
            <PortalBrand role={role} showTag />
            <nav className="mt-6 flex flex-col gap-1">
              {NAV[role].map((n, i) => (
                <a
                  key={n}
                  href="#"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium"
                  style={
                    i === 0
                      ? dark
                        ? { background: "rgba(255,255,255,.06)", color: t.colors.accent, boxShadow: `inset 3px 0 0 ${t.colors.accent}` }
                        : { background: "#EEF2FF", color: "#4338CA", boxShadow: `inset 3px 0 0 ${t.colors.accent}` }
                      : { color: dark ? "#C7CDF0" : "#475569" }
                  }
                >
                  {n}
                </a>
              ))}
            </nav>
          </aside>

          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <PortalHeader role={role} variant="desktop" context={CONTEXT[role]} status={STATUS[role]} right={<Bell dark={false} />} />
              <div className="bg-slate-50">
                <BrandLoader role={role} process="dashboard" variant="page" />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {PROCESSES[role].map((p) => (
                <div key={p} className="rounded-2xl bg-white ring-1 ring-slate-200">
                  <BrandLoader role={role} process={p} variant="section" />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <button type="button" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: t.colors.accent, color: t.colors.accentText }}>
                <BrandLoader role={role} process="save" variant="button" />
                {role === "student" ? "Saving time-in…" : role === "supervisor" ? "Verifying…" : "Exporting PDF…"}
              </button>
              <BrandLoader role={role} process={role === "coordinator" ? "search" : "notifications"} variant="inline" />
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-start gap-8">
          <div className="w-[390px] max-w-full overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200">
            <PortalHeader role={role} variant="mobile" pageTitle="Today" context={CONTEXT[role].split(" · ")[1] ?? CONTEXT[role]} status={STATUS[role]} onMenu={() => {}} right={<Bell dark={dark} />} />
            <div className="bg-slate-50">
              <BrandLoader role={role} process={PROCESSES[role][0]} variant="section" />
            </div>
          </div>
          <div className="relative h-[760px] w-[370px] max-w-full overflow-hidden rounded-[40px] ring-[10px] ring-slate-900" style={{ transform: "translateZ(0)" }}>
            <SplashScreen role={role} />
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex items-end gap-4">
              <BrandIcon size={128} title="INTERNet app icon" />
              <BrandIcon size={64} />
              <BrandIcon size={40} />
              <BrandIcon size={24} />
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <Wordmark height={48} />
            </div>
            <div className="rounded-2xl bg-[#1A237E] p-6">
              <Wordmark height={48} tone="onDark" />
            </div>
            <div className="rounded-2xl bg-[#1A237E] p-6">
              <BrandLockup layout="stacked" tone="onDark" size={32} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
