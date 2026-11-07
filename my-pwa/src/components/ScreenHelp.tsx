import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import Icon from "./Icon";
import ComposeMessage from "./ComposeMessage";
import { SkeletonRows } from "./ui";
import { HELP_ROLE_NAME, SCREEN_NAMES, answersFor, type HelpRole } from "../lib/helpAnswers";
import { useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| HELP FOR THIS SCREEN (PSU redesign, 8B; revisions, November 2026)
|--------------------------------------------------------------------------
|
| A "Help" pill in the header. It opens a sheet with the answers tagged for
| this screen (lib/helpAnswers.ts), one open at a time, and a way to ask a
| person: the trainee's supervisor, or the supervisor's coordinator. Help
| never opens by itself.
|
| Supervisors and coordinators: the pill shows only on screens with answers,
| and the sheet links to their Help centre.
|
| Trainees (November 2026): Help is no longer in their menu, so the pill is
| on every page and the sheet holds the whole Help centre as it was, after
| this screen's answers: search, topics, attendance times, what works with
| no connection, privacy and contacts. It is loaded only when opened.
|
*/

/** The trainee's whole Help centre, as /student/help showed it. Loaded when the sheet opens. */
const FullHelp = lazy(() =>
  import("../pages/Help").then((module) => ({
    default: function FullHelp({ role }: { role: HelpRole }) {
      return (
        <div className="space-y-6">
          <module.HelpCentre fixedRole={role} />
          <module.HelpSections role={role} />
        </div>
      );
    },
  }))
);

export default function ScreenHelp({ role }: { role: HelpRole }) {
  const { pathname } = useLocation();
  const answers = answersFor(role, pathname);
  const [open, setOpen] = useState(false);
  const everywhere = role === "student";
  if (answers.length === 0 && !everywhere) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={everywhere ? "Help" : undefined}
        title="Help"
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-bold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10 md:bg-white md:text-(--role-ink) md:ring-(--role-hairline) md:hover:bg-slate-50 ${
          everywhere ? "min-w-11 justify-center px-2.5 md:px-3" : "px-3"
        }`}
      >
        <Icon name="help" size={18} />
        <span className={everywhere ? "max-md:sr-only" : undefined}>Help</span>
      </button>
      {open && createPortal(<HelpSheet role={role} pathname={pathname} whole={everywhere} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function HelpSheet({ role, pathname, whole, onClose }: { role: HelpRole; pathname: string; whole: boolean; onClose: () => void }) {
  const answers = answersFor(role, pathname);
  const [shown, setShown] = useState<string | null>(answers[0]?.id ?? null);
  const [writing, setWriting] = useState(false);
  const student = useAccount("student");
  const dialog = useRef<HTMLDivElement | null>(null);
  const screen = SCREEN_NAMES[pathname] ?? "this screen";

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const supervisorId = role === "student" ? student?.supervisor_id : null;

  if (writing && supervisorId) {
    return (
      <ComposeMessage
        role="student"
        to={{ role: "supervisor", id: String(supervisorId) }}
        subject={`A question about ${screen}`}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-(--z-modal) flex items-end justify-center sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-help-title"
        className={`more-sheet animate-sheet-in sm:rounded-3xl ${whole ? "max-h-[92dvh] overflow-y-auto sm:max-w-3xl" : "sm:max-w-md"}`}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-(--role-primary)">{answers.length > 0 ? `Help for ${screen}` : `${HELP_ROLE_NAME[role]} help`}</p>
            <h2 id="screen-help-title" className="font-display mt-1 text-[24px] font-extrabold leading-tight text-slate-900">
              {answers[0]?.topic ?? "Help"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close help" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
            <Icon name="close" />
          </button>
        </div>
        {answers.length > 0 && (
          <ul className="mt-3 divide-y divide-(--role-hairline) border-y border-(--role-hairline)">
            {answers.map((answer) => {
              const isOpen = shown === answer.id;
              return (
                <li key={answer.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`help-${answer.id}`}
                    onClick={() => setShown(isOpen ? null : answer.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-[15.5px] font-semibold text-slate-900"
                  >
                    {answer.question}
                    <Icon name={isOpen ? "close" : "plus"} size={17} className={isOpen ? "text-(--role-primary)" : "text-slate-400"} />
                  </button>
                  {isOpen && (
                    <p id={`help-${answer.id}`} className="pb-3 text-[15px] leading-relaxed text-slate-700">
                      {answer.answer}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {whole ? (
          <div className="mt-5">
            <Suspense fallback={<SkeletonRows rows={4} />}>
              <FullHelp role={role} />
            </Suspense>
          </div>
        ) : (
          <Link
            to={`/${role}/help`}
            onClick={onClose}
            className="mt-4 flex min-h-12 items-center justify-between rounded-2xl bg-psu-50 px-4 text-[15px] font-bold text-psu-800"
          >
            All {HELP_ROLE_NAME[role].toLowerCase()} help
            <Icon name="chevron-right" size={18} />
          </Link>
        )}
        {supervisorId && (
          <p className="mt-3 text-center text-sm text-slate-600">
            Still stuck?{" "}
            <button type="button" onClick={() => setWriting(true)} className="inline-flex min-h-11 items-center font-bold text-slate-900 underline-offset-2 hover:underline">
              Message your supervisor
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
