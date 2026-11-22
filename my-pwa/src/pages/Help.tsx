import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HELP_ANSWERS, HELP_ROLE_NAME, type HelpAnswer, type HelpRole } from "../lib/helpAnswers";
import { useMediaQuery } from "../lib/useMediaQuery";
import { BrandLockup, PsuSeal } from "../brand";
import { ATTENDANCE_RULES_HELP, DECIDED_FIRST, OFFLINE_TABLE, type OfflineRow } from "../lib/offlineHelp";
import "./help.css";

/*
|--------------------------------------------------------------------------
| HELP
|--------------------------------------------------------------------------
|
| Open to everyone, signed in or not, and part of the first download so it
| opens with no connection too.
|
| The revision gives it the shape of a help centre people already know
| (Jakob's law): choose who you are first, which leaves only that role's
| answers (Hick's law); one large search, the first thing on the page
| (Fitts's law); topics as cards, each a region of its own (common region);
| answers grouped under their topic and opened one at a time (progressive
| disclosure), the searched words marked; an "On this page" list on wide
| screens to go straight to a part; and one card for when nothing here
| answers it. The same answers are "Help for this screen" in each portal
| (lib/helpAnswers.ts), written once.
|
*/

const ROLES: HelpRole[] = ["student", "supervisor", "coordinator"];

const COLUMNS: { key: keyof Omit<OfflineRow, "role">; title: string }[] = [
  { key: "works", title: "Works with no connection" },
  { key: "waits", title: "Waits on the phone, sent later" },
  { key: "needs", title: "Needs a connection" },
];

/** A topic's mark, drawn as a line icon. */
const TOPIC_ICON: Record<string, string> = {
  "Timing in": "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "Hours and rejections": "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  "Tasks and documents": "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  "Account and app": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  "Installing the app": "M12 3v12M7 10l5 5 5-5M5 21h14",
  Reviewing: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4",
  Monitoring: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  Deciding: "M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z",
  "Setting up": "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
};
const DEFAULT_ICON = "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z";

/** What people of each role most often look for: one tap fills the search. */
const POPULAR: Record<HelpRole, string[]> = {
  student: ["camera check", "time out", "rejected", "install"],
  supervisor: ["verify", "reject", "camera check", "changed"],
  coordinator: ["appeal", "term", "report", "account"],
};

function Glyph({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Items({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** The text with each place it contains the search marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return <>{text}</>;
  const parts: ReactNode[] = [];
  let from = 0;
  const lower = text.toLowerCase();
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-gold-200 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts.map((part, index) => (typeof part === "string" ? <Fragment key={`t${index}`}>{part}</Fragment> : part))}</>;
}

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

/** The answers, grouped under their topics, one open at a time. */
function AnswerList({ answers, query, grouped }: { answers: HelpAnswer[]; query: string; grouped: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const topics = [...new Set(answers.map((answer) => answer.topic))];
  const row = (answer: HelpAnswer) => {
    const isOpen = open === answer.id || (query.trim().length > 1 && answers.length <= 2);
    return (
      <li key={answer.id} className={`rounded-xl transition-colors ${isOpen ? "bg-psu-50/70 ring-1 ring-psu-200" : "hover:bg-slate-50"}`}>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpen(open === answer.id ? null : answer.id)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        >
          <span className="text-[15.5px] font-semibold text-slate-900">
            <Marked text={answer.question} query={query} />
          </span>
          <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-psu-700 ring-1 ring-slate-200 transition-transform ${isOpen ? "rotate-45" : ""}`}>
            <Glyph d="M12 5v14M5 12h14" size={14} />
          </span>
        </button>
        {isOpen && (
          <p className="px-3 pb-3.5 text-[15px] leading-relaxed text-slate-700">
            <Marked text={answer.answer} query={query} />
          </p>
        )}
      </li>
    );
  };
  if (!grouped) return <ul className="space-y-1">{answers.map(row)}</ul>;
  return (
    <div className="space-y-5">
      {topics.map((topic) => (
        <section key={topic} aria-label={topic}>
          <h3 className="help-topic-head mb-1.5 flex items-center gap-2 px-3 text-[14px] font-semibold text-slate-600">
            <span className="text-gold-700">
              <Glyph d={TOPIC_ICON[topic] ?? DEFAULT_ICON} size={15} />
            </span>
            {topic}
          </h3>
          <ul className="space-y-1">{answers.filter((answer) => answer.topic === topic).map(row)}</ul>
        </section>
      ))}
    </div>
  );
}

/** Searching and topics: the same in the portals and on the public page. */
function useHelpFilter(role: HelpRole) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const mine = HELP_ANSWERS.filter((answer) => answer.roles.includes(role));
  const topics = [...new Set(mine.map((answer) => answer.topic))];
  const text = query.trim().toLowerCase();
  const shown = mine.filter(
    (answer) => (!topic || answer.topic === topic) && (!text || `${answer.question} ${answer.answer} ${answer.topic}`.toLowerCase().includes(text))
  );
  return { query, setQuery, topic, setTopic, mine, topics, shown, searching: text.length > 0 };
}

/** "/" anywhere jumps to the search. */
function useSlashToSearch(search: RefObject<HTMLInputElement | null>) {
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
  }, [search]);
}

function SearchField({ value, onChange, inputRef, large = false }: { value: string; onChange: (value: string) => void; inputRef: RefObject<HTMLInputElement | null>; large?: boolean }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search help</span>
      <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Glyph d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" size={large ? 20 : 18} />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search help, for example “camera check”"
        className={`field pl-12 pr-12 ${large ? "min-h-14 rounded-2xl text-[17px] shadow-lg shadow-slate-900/10" : "min-h-12"}`}
      />
      <kbd aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-500">
        /
      </kbd>
    </label>
  );
}

function TopicChips({ topics, mine, topic, setTopic }: { topics: string[]; mine: HelpAnswer[]; topic: string | null; setTopic: (topic: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Topics">
      {topics.map((each) => (
        <button
          key={each}
          type="button"
          aria-pressed={topic === each}
          onClick={() => setTopic(topic === each ? null : each)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ${topic === each ? "bg-psu-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          <Glyph d={TOPIC_ICON[each] ?? DEFAULT_ICON} size={14} />
          {each} <span className={`tabular ${topic === each ? "text-white/80" : "text-slate-500"}`}>{mine.filter((answer) => answer.topic === each).length}</span>
        </button>
      ))}
    </div>
  );
}

function StillStuck({ role, fixedRole }: { role: HelpRole; fixedRole?: HelpRole }) {
  const signedIn = (() => {
    try {
      return localStorage.getItem("active_role");
    } catch {
      return null;
    }
  })();
  const message = fixedRole ? MESSAGE_PAGE[fixedRole] : undefined;
  return (
    <section aria-labelledby="still-stuck" className="help-stuck rounded-2xl bg-psu-900 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="still-stuck" className="font-display text-[20px] font-bold">
            Still need help?
          </h2>
          <p className="mt-1 text-sm text-white/80">Your OJT coordinator and your supervisor can sort out what these answers cannot.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {message ? (
            <Link to={message.path} className="inline-flex min-h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-semibold text-psu-950 hover:bg-gold-300 active:bg-gold-400">
              {message.label}
            </Link>
          ) : signedIn ? (
            <span className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-4 text-sm font-semibold">Message them from your portal</span>
          ) : role !== "coordinator" ? (
            <Link to={`/${role}/sign-in`} className="inline-flex min-h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-semibold text-psu-950 hover:bg-gold-300 active:bg-gold-400">
              Sign in to message them
            </Link>
          ) : null}
          {!fixedRole && (
            <a href="#contact" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold ring-1 ring-white/40 hover:bg-white/10">
              Contact the OJT office
            </a>
          )}
          {!fixedRole && (
            <Link to={`/forgot-password?role=${role}`} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold ring-1 ring-white/40 hover:bg-white/10">
              Forgot password
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/*
| Inside a portal (/student/help and the others: pages/PortalHelp.tsx):
| the role is the signed-in one and is not asked again.
*/
export function HelpCentre({ fixedRole }: { fixedRole: HelpRole }) {
  const search = useRef<HTMLInputElement | null>(null);
  useSlashToSearch(search);
  const { query, setQuery, topic, setTopic, mine, topics, shown, searching } = useHelpFilter(fixedRole);
  return (
    <div className="space-y-6">
      <section aria-labelledby="help-centre-title" className="help-portal card-hairline overflow-hidden rounded-2xl">
        <div className="help-band">
          <span className="help-arc" aria-hidden="true" />
          <h2 id="help-centre-title" className="help-band-title">
            {HELP_ROLE_NAME[fixedRole]} help
          </h2>
          <p className="help-band-lead">Search the answers, or pick a topic.</p>
          <div className="mt-4 max-w-2xl">
            <SearchField value={query} onChange={setQuery} inputRef={search} large />
          </div>
        </div>
        <div className="help-portal-body">
        <div>
          <TopicChips topics={topics} mine={mine} topic={topic} setTopic={setTopic} />
        </div>
        <div className="mt-5 border-t border-slate-200 pt-4">
          {shown.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing matches. Try another word, or the reference below.</p>
          ) : (
            <AnswerList answers={shown} query={query} grouped={!searching && !topic} />
          )}
        </div>
        </div>
      </section>
      {fixedRole !== "coordinator" && <StillStuck role={fixedRole} fixedRole={fixedRole} />}
    </div>
  );
}

/*
| The public Help centre at /help (Hallmark redesign, 2026-11-21): a help
| desk. The question, who is asking and the search on a compact navy band;
| then the topics as a list down the side (a filter, with their counts) and
| the answers themselves beside it, straight away; then "Still need help?"
| and the reference. One way to each answer, no topic cards repeating the
| list.
*/
export default function Help() {
  const standalone = useMediaQuery("(display-mode: standalone)");
  const [params] = useSearchParams();
  const [role, setRole] = useState<HelpRole>(() => startingRole(params));
  const search = useRef<HTMLInputElement | null>(null);
  const answersRef = useRef<HTMLDivElement | null>(null);
  useSlashToSearch(search);
  const { query, setQuery, topic, setTopic, mine, topics, shown, searching } = useHelpFilter(role);

  useEffect(() => {
    document.title = "Help · INTERNet";
  }, []);

  const pickTopic = (next: string | null) => {
    setTopic(next);
    answersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reference = [
    ...(role === "student" ? [{ id: "attendance-times", label: "Attendance times" }] : []),
    { id: "offline", label: "With no connection" },
    ...(role === "student" ? [{ id: "privacy", label: "Privacy notice" }] : []),
    ...(role !== "coordinator" ? [{ id: "contact", label: "Contact the OJT office" }] : []),
    { id: "about", label: "About INTERNet" },
  ];

  return (
    <main className="help-public app-canvas min-h-[calc(100dvh-var(--inb-top-inset))] pb-14">
      <header className="help-top">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <BrandLockup size={22} tagline={null} tone="onDark" />
          {/* Inside the installed app there is no way back to the website (PSU redesign 5). */}
          {standalone ? (
            <button type="button" onClick={() => window.history.back()} aria-label="Back" title="Back" className="help-back">
              <Glyph d="M15 18l-6-6 6-6" size={20} />
            </button>
          ) : (
            // A full page load: "/" inside the app redirects to the signed-in portal; the landing page is its own file.
            <a href="/" aria-label="Back to INTERNet" title="Back to INTERNet" className="help-back">
              <Glyph d="M15 18l-6-6 6-6" size={20} />
            </a>
          )}
        </div>
      </header>

      {/* The question, who is asking, and the search. */}
      <section aria-labelledby="help-title" className="help-hero">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="help-hero-row">
            <h1 id="help-title" className="help-hero-title">
              How can we help?
            </h1>
            <div role="tablist" aria-label="I'm a" className="help-roles">
              {ROLES.map((each) => (
                <button
                  key={each}
                  type="button"
                  role="tab"
                  aria-selected={each === role}
                  onClick={() => {
                    setRole(each);
                    setTopic(null);
                  }}
                  className="help-role-tab"
                >
                  I&rsquo;m a {HELP_ROLE_NAME[each].toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 max-w-3xl">
            <SearchField value={query} onChange={setQuery} inputRef={search} large />
          </div>
          <p className="help-popular">
            <span>Popular:</span>
            {POPULAR[role].map((word) => (
              <button key={word} type="button" onClick={() => setQuery(word)} className="help-popular-chip">
                {word}
              </button>
            ))}
          </p>
        </div>
      </section>

      <div className="help-desk mx-auto w-full max-w-6xl px-4">
        {/* The topics, down the side on a computer: a filter, with their counts; then the reference. */}
        <nav aria-label="Topics and this page" className="help-side">
          <div className="help-side-inner">
            <p className="help-side-head">Topics</p>
            <ul className="help-topics">
              <li>
                <button type="button" aria-pressed={!topic && !searching} onClick={() => { setQuery(""); pickTopic(null); }} className="help-topic">
                  <Glyph d={DEFAULT_ICON} size={16} />
                  <span>All answers</span>
                  <em>{mine.length}</em>
                </button>
              </li>
              {topics.map((each) => (
                <li key={each}>
                  <button type="button" aria-pressed={topic === each} onClick={() => pickTopic(topic === each ? null : each)} className="help-topic">
                    <Glyph d={TOPIC_ICON[each] ?? DEFAULT_ICON} size={16} />
                    <span>{each}</span>
                    <em>{mine.filter((answer) => answer.topic === each).length}</em>
                  </button>
                </li>
              ))}
            </ul>
            <p className="help-side-head help-ref-head">On this page</p>
            <ul className="help-ref-links">
              {reference.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* A phone: the topics as one row of chips, above the answers. */}
          <div className="help-chips lg:hidden">
            <TopicChips topics={topics} mine={mine} topic={topic} setTopic={pickTopic} />
          </div>

          <section ref={answersRef} id="answers" aria-labelledby="answers-title" className="help-answers scroll-mt-24">
            <div className="help-answers-head">
              <h2 id="answers-title" className="help-answers-title">
                {searching ? (
                  <>
                    {shown.length} {shown.length === 1 ? "answer" : "answers"} for &ldquo;{query.trim()}&rdquo;
                  </>
                ) : topic ? (
                  topic
                ) : (
                  <>Answers for {HELP_ROLE_NAME[role].toLowerCase()}s</>
                )}
              </h2>
              {(searching || topic) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTopic(null);
                  }}
                  className="help-show-all"
                >
                  Show all answers
                </button>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="px-1 text-sm text-slate-600">Nothing matches. Try another word, a topic, or the reference below.</p>
            ) : (
              <AnswerList answers={shown} query={query} grouped={!searching && !topic} />
            )}
          </section>

          <StillStuck role={role} />
          <HelpSections role={role} everyRole />
          <section id="about" aria-labelledby="about-title" className="help-about scroll-mt-24">
            <PsuSeal size={52} clearSpace={false} />
            <div>
              <h2 id="about-title" className="text-lg font-semibold text-slate-900">
                About INTERNet
              </h2>
              <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-slate-700">
                Attendance, tasks, requirements and records for on-the-job training at Pangasinan State University, Lingayen Campus, for trainees, their
                supervisors and the OJT coordinator.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

const ROLE_ROW: Record<HelpRole, OfflineRow["role"]> = { student: "Student", supervisor: "Supervisor", coordinator: "Coordinator" };

/** A reference section's heading, with its mark. */
function SectionHead({ id, icon, title, lead }: { id: string; icon: string; title: string; lead?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-psu-50 text-psu-700">
        <Glyph d={icon} size={19} />
      </span>
      <div>
        <h2 id={id} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {lead && <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-slate-700">{lead}</p>}
      </div>
    </div>
  );
}

/**
 * The reference below the answers: attendance times (trainees), what works
 * with no connection, privacy and whom to contact. Given a role, only that
 * role's part (on the public page the table still shows every role).
 */
export function HelpSections({ role, everyRole = false }: { role?: HelpRole; everyRole?: boolean }) {
  // The public page shows every role's row in the table; a portal only its own.
  const tableRows = role && !everyRole ? OFFLINE_TABLE.filter((row) => row.role === ROLE_ROW[role]) : OFFLINE_TABLE;
  useEffect(() => {
    // Opened as …/help#offline: go to that part.
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <>
      {(!role || role === "student") && (
        <section aria-labelledby="attendance-times" className="scroll-mt-24 rounded-2xl card-hairline bg-white p-5 sm:p-6">
          <SectionHead
            id="attendance-times"
            icon="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
            title="Attendance times"
            lead="For trainees. Your Attendance page always shows the times worked out for your own day."
          />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {ATTENDANCE_RULES_HELP.map((line) => (
              <li key={line} className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200/70">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="offline" className="scroll-mt-24 rounded-2xl card-hairline bg-white p-5 sm:p-6">
        <SectionHead
          id="offline"
          icon="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"
          title="With no connection"
          lead={
            <>
              INTERNet keeps what you last opened on this phone or computer, so you can still read it with no signal. A few attendance steps can be
              recorded too: they wait on the phone and are sent by themselves once the server can be reached. Students see them under{" "}
              <strong>Waiting to send</strong> on every page, with how long each can still wait, and can retry or discard them there. Signing out erases
              anything still waiting.
            </>
          }
        />

        {/* Wide screens: one table. */}
        <div className="mt-5 hidden overflow-hidden rounded-xl ring-1 ring-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">What works with no connection, for each role</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="w-28 px-4 py-2.5 font-semibold text-slate-900">
                  Role
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className="px-4 py-2.5 font-semibold text-slate-900">
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.role} className="border-t border-slate-100 align-top">
                  <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                    {row.role}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-4 py-3 text-slate-700">
                      <Items items={row[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: the same, one role at a time. */}
        <div className="mt-5 space-y-4 md:hidden">
          {tableRows.map((row) => (
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

        <div className="mt-5 rounded-xl bg-gold-50 p-4 ring-1 ring-gold-200">
          <h3 className="font-semibold text-slate-900">When two people decide the same record</h3>
          <p className="mt-1 text-sm text-slate-700">{DECIDED_FIRST}</p>
        </div>
      </section>

      {/* Iteration 23: the landing page's footer links here. */}
      {(!role || role === "student") && (
        <section aria-labelledby="privacy" className="scroll-mt-24 rounded-2xl card-hairline bg-white p-5 sm:p-6">
          <SectionHead
            id="privacy"
            icon="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"
            title="Privacy notice"
            lead={
              <>
                The privacy notice is shown in the Trainee app before the first time-in, the moment the app first takes a photo, and again whenever it
                changes. It says what is kept and why. A trainee can read it again at any time in <strong>Profile, Privacy and data</strong>, where{" "}
                <strong>Download my data</strong> gives a copy of their own records. Time-in photos are seen by the trainee&rsquo;s supervisor and the
                OJT coordinator.
              </>
            }
          />
        </section>
      )}

      {role !== "coordinator" && (
        <section aria-labelledby="contact" className="scroll-mt-24 rounded-2xl card-hairline bg-white p-5 sm:p-6">
          <SectionHead
            id="contact"
            icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            title="Contact the OJT office"
            lead={
              <>
                Ask your program&rsquo;s OJT coordinator at the OJT office, Pangasinan State University, Lingayen Campus. The coordinator creates every
                account, so a supervisor or trainee without one asks there. A forgotten password can be reset from each role&rsquo;s sign-in page.
              </>
            }
          />
        </section>
      )}
    </>
  );
}
