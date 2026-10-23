import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import Icon from "./Icon";
import ComposeMessage from "./ComposeMessage";
import { HELP_ROLE_NAME, SCREEN_NAMES, answersFor, type HelpRole } from "../lib/helpAnswers";
import { useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| HELP FOR THIS SCREEN (PSU redesign, 8B)
|--------------------------------------------------------------------------
|
| A "Help" pill in the header, only on screens that have answers tagged for
| them (lib/helpAnswers.ts). It opens a sheet with those two or three
| answers, one open at a time, then "All … help" (the Help centre, on the
| role) and a way to ask a person: the trainee's supervisor, or the
| supervisor's coordinator. Help never opens by itself.
|
*/

export default function ScreenHelp({ role }: { role: HelpRole }) {
  const { pathname } = useLocation();
  const answers = answersFor(role, pathname);
  const [open, setOpen] = useState(false);
  if (answers.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10 md:bg-white md:text-(--role-ink) md:ring-(--role-hairline) md:hover:bg-slate-50"
      >
        <Icon name="help" size={18} />
        Help
      </button>
      {open && createPortal(<HelpSheet role={role} pathname={pathname} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function HelpSheet({ role, pathname, onClose }: { role: HelpRole; pathname: string; onClose: () => void }) {
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
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="screen-help-title" className="more-sheet animate-sheet-in sm:max-w-md sm:rounded-3xl">
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-(--role-primary)">Help for {screen}</p>
            <h2 id="screen-help-title" className="font-display mt-1 text-[24px] font-extrabold leading-tight text-slate-900">
              {answers[0]?.topic ?? "Help"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close help" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
            <Icon name="close" />
          </button>
        </div>
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
        <Link
          to={`/${role}/help`}
          onClick={onClose}
          className="mt-4 flex min-h-12 items-center justify-between rounded-2xl bg-psu-50 px-4 text-[15px] font-bold text-psu-800"
        >
          All {HELP_ROLE_NAME[role].toLowerCase()} help
          <Icon name="chevron-right" size={18} />
        </Link>
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
