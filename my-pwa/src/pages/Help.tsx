import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HELP_ANSWERS, HELP_ROLE_NAME, type HelpAnswer, type HelpRole } from "../lib/helpAnswers";
import { useMediaQuery } from "../lib/useMediaQuery";
import { BrandLockup, PsuSeal } from "../brand";
import { ATTENDANCE_RULES_HELP, DECIDED_FIRST, OFFLINE_TABLE, type OfflineRow } from "../lib/offlineHelp";

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
          <h3 className="mb-1.5 flex items-center gap-2 px-3 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-500">
            <span className="text-psu-700">
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
    <section aria-labelledby="still-stuck" className="rounded-2xl bg-psu-900 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="still-stuck" className="font-display text-[20px] font-extrabold">
            Still need help?
          </h2>
          <p className="mt-1 text-sm text-white/80">Your OJT coordinator and your supervisor can sort out what these answers cannot.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {message ? (
            <Link to={message.path} className="inline-flex min-h-11 items-center rounded-xl bg-gold-400 px-4 text-sm font-extrabold text-psu-900 hover:bg-gold-300">
              {message.label}
            </Link>
          ) : signedIn ? (
            <span className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-4 text-sm font-semibold">Message them from your portal</span>
          ) : role !== "coordinator" ? (
            <Link to={`/${role}/sign-in`} className="inline-flex min-h-11 items-center rounded-xl bg-gold-400 px-4 text-sm font-extrabold text-psu-900 hover:bg-gold-300">
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
      <section aria-labelledby="help-centre-title" className="card-hairline rounded-2xl p-5 sm:p-7">
        <h2 id="help-centre-title" className="text-[16px] font-bold text-slate-900">
          {HELP_ROLE_NAME[fixedRole]} help
        </h2>
        <div className="mt-3">
          <SearchField value={query} onChange={setQuery} inputRef={search} />
        </div>
        <div className="mt-4">
          <TopicChips topics={topics} mine={mine} topic={topic} setTopic={setTopic} />
        </div>
        <div className="mt-5 border-t border-slate-200 pt-4">
          {shown.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing matches. Try another word, or the reference below.</p>
          ) : (
            <AnswerList answers={shown} query={query} grouped={!searching && !topic} />
          )}
        </div>
      </section>
      {fixedRole !== "coordinator" && <StillStuck role={fixedRole} fixedRole={fixedRole} />}
    </div>
  );
}

/** The public Help centre at /help. */
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
  const sections = [
    { id: "answers", label: "Answers" },
    ...(role === "student" ? [{ id: "attendance-times", label: "Attendance times" }] : []),
    { id: "offline", label: "With no connection" },
    ...(role === "student" ? [{ id: "privacy", label: "Privacy notice" }] : []),
    ...(role !== "coordinator" ? [{ id: "contact", label: "Contact the OJT office" }] : []),
    { id: "about", label: "About INTERNet" },
  ];

  return (
    <main className="app-canvas min-h-[calc(100dvh-var(--inb-top-inset))] pb-12">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <BrandLockup size={22} tagline={null} />
          {/* Inside the installed app there is no way back to the website (PSU redesign 5). */}
          {standalone ? (
            <button type="button" onClick={() => window.history.back()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-psu-700 hover:bg-psu-50">
              <Glyph d="M15 18l-6-6 6-6" size={16} />
              Back
            </button>
          ) : (
            // A full page load: "/" inside the app redirects to the signed-in portal; the landing page is its own file.
            <a href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-psu-700 hover:bg-psu-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-psu-600">
              <Glyph d="M15 18l-6-6 6-6" size={16} />
              Back to INTERNet
            </a>
          )}
        </div>
      </header>

      {/* The question, who is asking, and the search: first, and largest. */}
      <section aria-labelledby="help-title" className="bg-psu-900 text-white" style={{ backgroundImage: "var(--inb-grain)" }}>
        <div className="mx-auto w-full max-w-6xl px-4 py-9 sm:py-12">
          <div className="max-w-3xl animate-page-in">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.14em] text-gold-300">Help centre</p>
            <h1 id="help-title" className="font-display mt-2 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
              How can we help?
            </h1>
            <div role="tablist" aria-label="I'm a" className="mt-5 inline-flex flex-wrap gap-1 rounded-2xl bg-white/10 p-1">
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
                  className={`min-h-11 rounded-xl px-4 text-sm font-bold transition-colors ${each === role ? "bg-white text-psu-900" : "text-white/85 hover:bg-white/10"}`}
                >
                  I&rsquo;m a {HELP_ROLE_NAME[each].toLowerCase()}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <SearchField value={query} onChange={setQuery} inputRef={search} large />
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/75">
              Popular:
              {POPULAR[role].map((word) => (
                <button key={word} type="button" onClick={() => setQuery(word)} className="min-h-8 rounded-full bg-white/10 px-3 font-semibold text-white hover:bg-white/20">
                  {word}
                </button>
              ))}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* On this page: wide screens only, kept in view. */}
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">On this page</p>
            <ul className="mt-2 space-y-0.5 border-l border-slate-200">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-3 text-sm font-medium text-slate-600 hover:border-psu-600 hover:text-psu-800">
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* Topics: a card each, the way in when the words to search for are not known. */}
          {!searching && (
            <section aria-labelledby="topics-title">
              <h2 id="topics-title" className="sr-only">
                Topics
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {topics.map((each) => {
                  const inTopic = mine.filter((answer) => answer.topic === each);
                  const on = topic === each;
                  return (
                    <li key={each}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => pickTopic(on ? null : each)}
                        className={`group flex h-full w-full flex-col gap-2 rounded-2xl p-4 text-left transition ${on ? "bg-psu-700 text-white shadow-lg shadow-psu-900/20" : "card-hairline bg-white hover:-translate-y-0.5 hover:shadow-md"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className={`grid h-10 w-10 place-items-center rounded-xl ${on ? "bg-white/15 text-gold-300" : "bg-psu-50 text-psu-700"}`}>
                            <Glyph d={TOPIC_ICON[each] ?? DEFAULT_ICON} size={19} />
                          </span>
                          <span className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${on ? "bg-white/15" : "bg-slate-100 text-slate-600"}`}>
                            {inTopic.length} {inTopic.length === 1 ? "answer" : "answers"}
                          </span>
                        </span>
                        <span className={`font-display text-[17px] font-extrabold ${on ? "" : "text-slate-900"}`}>{each}</span>
                        <span className={`line-clamp-2 text-[13.5px] ${on ? "text-white/80" : "text-slate-600"}`}>{inTopic.map((answer) => answer.question).join(" · ")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section ref={answersRef} id="answers" aria-labelledby="answers-title" className="scroll-mt-24 card-hairline rounded-2xl bg-white p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 id="answers-title" className="text-lg font-semibold text-slate-900">
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
                  className="min-h-9 rounded-lg px-2 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                >
                  Show all answers
                </button>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="px-1 text-sm text-slate-600">Nothing matches. Try another word, a topic above, or the reference below.</p>
            ) : (
              <AnswerList answers={shown} query={query} grouped={!searching && !topic} />
            )}
          </section>

          <StillStuck role={role} />
          <HelpSections role={role} everyRole />
          <section id="about" aria-labelledby="about-title" className="flex scroll-mt-24 flex-col gap-4 rounded-2xl card-hairline bg-white p-5 sm:flex-row sm:items-center sm:p-6">
            <PsuSeal size={60} clearSpace={false} />
            <div>
              <h2 id="about-title" className="text-lg font-semibold text-slate-900">
                About INTERNet
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Attendance, tasks, requirements and records for on-the-job training at Pangasinan State University – Lingayen Campus, for
                trainees, their supervisors and the OJT coordinator.
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
        {lead && <p className="mt-1 text-sm leading-relaxed text-slate-700">{lead}</p>}
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
                Ask your program&rsquo;s OJT coordinator at the OJT office, Pangasinan State University – Lingayen Campus. The coordinator creates every
                account, so a supervisor or trainee without one asks there. A forgotten password can be reset from each role&rsquo;s sign-in page.
              </>
            }
          />
        </section>
      )}
    </>
  );
}
