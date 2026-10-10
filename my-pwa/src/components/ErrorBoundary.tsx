import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrandLockup } from "../brand";
import { reportClientError } from "../lib/clientErrors";
import { signOut, type SessionRole } from "../lib/session";

const ROLES: SessionRole[] = ["student", "supervisor", "coordinator"];

/** The role signed in on this device, read without any React state. */
function signedInRole(): SessionRole | null {
  try {
    const active = localStorage.getItem("active_role") as SessionRole | null;
    return active && ROLES.includes(active) && localStorage.getItem(`${active}_token`)
      ? active
      : null;
  } catch {
    return null;
  }
}

/** A page file that would not download, as opposed to a fault in the page. */
function isLoadFailure(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(
    error.message
  );
}

type State = { error: Error | null };

/**
 * Catches a crash anywhere in the app and shows a way out, where there used
 * to be a blank white screen. Sits outside the router and every layout, so
 * it works whatever broke, and uses plain links and reloads for the same
 * reason.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PAGE CRASH:", error, info.componentStack);
    reportClientError(error, info.componentStack);
    // The launch screen must not sit on top of this one.
    window.dispatchEvent(new Event("inb:ready"));
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const role = signedInRole();
    const loadFailure = isLoadFailure(error);

    return (
      <main className="app-canvas flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <BrandLockup size={24} tagline={null} />
          </div>
          <section
            role="alert"
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-raised"
          >
            <div aria-hidden="true" className="flex h-1">
              <span className="surface-brand-bar flex-1" />
              <span className="w-16 bg-gold-400" />
            </div>
            <div className="p-6 sm:p-7">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {loadFailure ? "This page did not load" : "This page ran into a problem"}
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                {loadFailure
                  ? "Part of the page could not be downloaded. Check your connection, then reload."
                  : "Nothing you saved has been lost. Reloading usually fixes it. If it happens again, tell your OJT coordinator which page you were on."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-psu-700 px-4 text-sm font-semibold text-white hover:bg-psu-800"
                >
                  Reload
                </button>
                {role && (
                  <button
                    type="button"
                    onClick={() => {
                      signOut(role);
                      window.location.assign("/");
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>
          </section>
          <p className="mt-5 text-center text-xs text-slate-500">
            Pangasinan State University · Lingayen Campus
          </p>
        </div>
      </main>
    );
  }
}
