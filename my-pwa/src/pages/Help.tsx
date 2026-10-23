import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HELP_ANSWERS, HELP_ROLE_NAME, type HelpRole } from "../lib/helpAnswers";
import { useMediaQuery } from "../lib/useMediaQuery";
import { BrandLockup, PsuSeal } from "../brand";
import { ATTENDANCE_RULES_HELP, DECIDED_FIRST, OFFLINE_TABLE, type OfflineRow } from "../lib/offlineHelp";

/*
|--------------------------------------------------------------------------
| HELP
|--------------------------------------------------------------------------
|
| Iteration 12. Open to everyone, signed in or not, and part of the first
| download so it opens with no connection too. For now it answers one
| question: what still works when there is no signal.
|
*/

const COLUMNS: { key: keyof Omit<OfflineRow, "role">; title: string }[] = [
  { key: "works", title: "Works with no connection" },
  { key: "waits", title: "Waits on the phone, sent later" },
  { key: "needs", title: "Needs a connection" },
];

function Items({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/*
| PSU redesign, 8A: the Help centre. The same answers as "Help for this
| screen" (lib/helpAnswers.ts), written once: pick a role, browse by topic,
| search everything ("/" jumps to the search). One answer open at a time.
| Public, so anyone can read it before signing in. Inside a portal
| (/student/help, /supervisor/help, /coordinator/help: pages/PortalHelp.tsx)
| the role is the signed-in one and is not asked again.
*/
const ROLES: HelpRole[] = ["student", "supervisor", "coordinator"];

function startingRole(params: URLSearchParams): HelpRole {
  const asked = params.get("role");
  if (ROLES.includes(asked as HelpRole)) return asked as HelpRole;
  try {
    const active = localStorage.getItem("active_role");
    if (ROLES.includes(active as HelpRole)) return active as HelpRole;
  } catch {
    /* private mode: the trainee */
  }
  return "student";
}

const MESSAGE_PAGE: Partial<Record<HelpRole, { path: string; label: string }>> = {
  student: { path: "/messages", label: "Message your supervisor" },
  supervisor: { path: "/supervisor/messages", label: "Message the coordinator" },
};

export function HelpCentre({ fixedRole }: { fixedRole?: HelpRole }) {
  const [params] = useSearchParams();
  const [chosen, setRole] = useState<HelpRole>(() => startingRole(params));
  const role = fixedRole ?? chosen;
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const signedIn = (() => {
    try {
      return localStorage.getItem("active_role");
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.matches?.("input, textarea, select");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const mine = HELP_ANSWERS.filter((answer) => answer.roles.includes(role));
  const topics = [...new Set(mine.map((answer) => answer.topic))];
  const text = query.trim().toLowerCase();
  const shown = mine.filter(
    (answer) => (!topic || answer.topic === topic) && (!text || `${answer.question} ${answer.answer} ${answer.topic}`.toLowerCase().includes(text))
  );

  return (
    <section aria-labelledby="help-centre-title" className="card-hairline rounded-2xl p-5 sm:p-7">
      {fixedRole ? (
        // In a portal the page's own header names it; this is the section.
        <h2 id="help-centre-title" className="text-[16px] font-bold text-slate-900">
          {HELP_ROLE_NAME[fixedRole]} help
        </h2>
      ) : (
        <>
          <p className="eyebrow text-psu-700">Help centre</p>
          <h1 id="help-centre-title" className="font-display mt-1 text-[30px] font-extrabold leading-tight tracking-tight text-slate-900">
            What do you need help with?
          </h1>
        </>
      )}
      {!fixedRole && <div role="tablist" aria-label="I'm a" className="mt-4 flex flex-wrap gap-2">
        {ROLES.map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            aria-selected={each === role}
            onClick={() => {
              setRole(each);
              setTopic(null);
              setOpen(null);
            }}
            className={`min-h-11 rounded-full px-4 text-sm font-bold ${each === role ? "bg-psu-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {HELP_ROLE_NAME[each]}
          </button>
        ))}
      </div>}
      <label className="relative mt-4 block">
        <span className="sr-only">Search help</span>
        <input
          ref={search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help, for example “camera check”"
          className="field min-h-12 pr-10"
        />
        <kbd aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-300 px-1.5 text-xs text-slate-500">
          /
        </kbd>
      </label>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Topics">
        {topics.map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={topic === each}
            onClick={() => setTopic(topic === each ? null : each)}
            className={`min-h-10 rounded-full px-3.5 text-[13.5px] font-semibold ${topic === each ? "bg-psu-100 text-psu-900 ring-1 ring-psu-600/30" : "bg-slate-100 text-slate-700"}`}
          >
            {each} <span className="tabular text-slate-500">{mine.filter((answer) => answer.topic === each).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mt-5 text-sm text-slate-600">Nothing matches. Try another word, or the table below.</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
          {shown.map((answer) => {
            const isOpen = open === answer.id;
            return (
              <li key={answer.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : answer.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span>
                    <span className="eyebrow block text-slate-500">{answer.topic}</span>
                    <span className="block text-[15.5px] font-semibold text-slate-900">{answer.question}</span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-slate-400">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && <p className="pb-3 text-[15px] leading-relaxed text-slate-700">{answer.answer}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {fixedRole !== "coordinator" && <p className="mt-4 text-sm text-slate-700">
        Still stuck?{" "}
        {fixedRole && MESSAGE_PAGE[fixedRole] ? (
          <Link to={MESSAGE_PAGE[fixedRole]!.path} className="font-bold text-psu-700 underline-offset-2 hover:underline">
            {MESSAGE_PAGE[fixedRole]!.label}
          </Link>
        ) : signedIn ? (
          <span>Message your supervisor or coordinator from your portal.</span>
        ) : (
          <Link to={`/${role}/sign-in`} className="font-bold text-psu-700 underline-offset-2 hover:underline">
            Sign in to message your supervisor or coordinator
          </Link>
        )}
      </p>}
    </section>
  );
}

export default function Help() {
  const standalone = useMediaQuery("(display-mode: standalone)");
  useEffect(() => {
    document.title = "Help · INTERNet";
  }, []);

  return (
    <main className="app-canvas min-h-[calc(100dvh-var(--inb-top-inset))] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-5xl animate-page-in">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <BrandLockup size={24} tagline={null} />
          {/* Inside the installed app there is no way back to the website (PSU redesign 5). */}
          {standalone ? (
            <button type="button" onClick={() => window.history.back()} className="min-h-11 rounded-md text-sm font-medium text-psu-700 underline-offset-2 hover:underline">
              Back
            </button>
          ) : (
            <Link to="/" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-psu-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-psu-600">
              Back to INTERNet
            </Link>
          )}
        </div>

        <HelpCentre />
        <HelpSections />
        <section aria-labelledby="about" className="mt-6 flex flex-col gap-4 rounded-2xl card-hairline p-5 sm:flex-row sm:items-center sm:p-7">
          <PsuSeal size={64} clearSpace={false} />
          <div>
            <h2 id="about" className="text-lg font-semibold text-slate-900">
              About INTERNet
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              A system proposal for Pangasinan State University – Lingayen Campus: attendance, tasks, requirements and
              records for on-the-job training, for trainees, their supervisors and the OJT coordinator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

const ROLE_ROW: Record<HelpRole, OfflineRow["role"]> = { student: "Student", supervisor: "Supervisor", coordinator: "Coordinator" };

/**
 * The reference below the answers: attendance times (trainees), what works
 * with no connection, privacy and whom to contact. Given a role, only that
 * role's part.
 */
export function HelpSections({ role }: { role?: HelpRole }) {
  const rows = role ? OFFLINE_TABLE.filter((row) => row.role === ROLE_ROW[role]) : OFFLINE_TABLE;
  useEffect(() => {
    // Opened as …/help#offline: go to that part.
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <>
        {(!role || role === "student") && <section aria-labelledby="attendance-times" className="mt-6 rounded-2xl card-hairline p-5 sm:p-7">
          <h2 id="attendance-times" className="text-lg font-semibold text-slate-900">
            Attendance times
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            For trainees. Your Attendance page always shows the times worked out for your own day.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {ATTENDANCE_RULES_HELP.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>}

        <section aria-labelledby="offline" className="mt-6 rounded-2xl card-hairline p-5 sm:p-7">
          <h2 id="offline" className="text-lg font-semibold text-slate-900">
            With no connection
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            INTERNet keeps what you last opened on this phone or computer, so you can still read it with no signal. A few
            attendance steps can be recorded too: they wait on the phone and are sent by themselves once the server can be
            reached. Students see them under <strong>Waiting to send</strong> on every page, with how long each can still wait,
            and can retry or discard them there. Signing out erases anything still waiting.
          </p>

          {/* Wide screens: one table. */}
          <table className="mt-5 hidden w-full border-collapse text-left text-sm md:table">
            <caption className="sr-only">What works with no connection, for each role</caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="w-28 py-2 pr-4 font-semibold text-slate-900">
                  Role
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className="py-2 pr-4 font-semibold text-slate-900">
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.role} className="border-b border-slate-100 align-top last:border-0">
                  <th scope="row" className="py-3 pr-4 font-semibold text-slate-900">
                    {row.role}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="py-3 pr-4 text-slate-700">
                      <Items items={row[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones: the same, one role at a time. */}
          <div className="mt-5 space-y-4 md:hidden">
            {rows.map((row) => (
              <section key={row.role} aria-label={row.role} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">{row.role}</h3>
                <dl className="mt-2 space-y-3 text-sm text-slate-700">
                  {COLUMNS.map((column) => (
                    <div key={column.key}>
                      <dt className="font-medium text-slate-900">{column.title}</dt>
                      <dd className="mt-1">
                        <Items items={row[column.key]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <h3 className="mt-6 font-semibold text-slate-900">When two people decide the same record</h3>
          <p className="mt-1 text-sm text-slate-700">{DECIDED_FIRST}</p>
        </section>

        {/* Iteration 23: the landing page's footer links here. */}
        {(!role || role === "student") && <section aria-labelledby="privacy" className="mt-6 scroll-mt-6 rounded-2xl card-hairline p-5 sm:p-7">
          <h2 id="privacy" className="text-lg font-semibold text-slate-900">
            Privacy notice
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            The privacy notice is shown in the Trainee app before the first time-in, the moment the app first takes a photo,
            and again whenever it changes. It says what is kept and why. A trainee can read it again at any time in{" "}
            <strong>Profile, Privacy and data</strong>, where <strong>Download my data</strong> gives a copy of their own records. Time-in
            photos are seen by the trainee&rsquo;s supervisor and the OJT coordinator.
          </p>
        </section>}

        {role !== "coordinator" && <section aria-labelledby="contact" className="mt-6 scroll-mt-6 rounded-2xl card-hairline p-5 sm:p-7">
          <h2 id="contact" className="text-lg font-semibold text-slate-900">
            Contact the OJT office
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            Ask your program&rsquo;s OJT coordinator at the OJT office, Pangasinan State University – Lingayen Campus. The
            coordinator creates every account, so a supervisor or trainee without one asks there. A forgotten password can be
            reset from each role&rsquo;s sign-in page.
          </p>
        </section>}

    </>
  );
}

