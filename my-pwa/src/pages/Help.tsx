import { useEffect } from "react";
import { Link } from "react-router-dom";
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

export default function Help() {
  useEffect(() => {
    document.title = "Help · INTERNet";
    // Opened as /help#offline: go to that part.
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <main className="app-canvas min-h-[calc(100dvh-var(--inb-top-inset))] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-5xl animate-page-in">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <BrandLockup size={24} tagline={null} />
          <Link to="/" className="rounded-md text-sm font-medium text-psu-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-psu-600">
            Back to INTERNet
          </Link>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Help</h1>

        <section aria-labelledby="attendance-times" className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-7">
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
        </section>

        <section aria-labelledby="offline" className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-7">
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
              {OFFLINE_TABLE.map((row) => (
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
            {OFFLINE_TABLE.map((row) => (
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
        <section aria-labelledby="privacy" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-7">
          <h2 id="privacy" className="text-lg font-semibold text-slate-900">
            Privacy notice
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            The privacy notice is shown in the Trainee app before the first time-in, the moment the app first takes a photo,
            and again whenever it changes. It says what is kept and why. A trainee can read it again at any time in{" "}
            <strong>Profile, Privacy and data</strong>, where <strong>Download my data</strong> gives a copy of their own records. Time-in
            photos are seen by the trainee&rsquo;s supervisor and the OJT coordinator.
          </p>
        </section>

        <section aria-labelledby="contact" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-7">
          <h2 id="contact" className="text-lg font-semibold text-slate-900">
            Contact the OJT office
          </h2>
          <p className="mt-1.5 text-sm text-slate-700">
            Ask your program&rsquo;s OJT coordinator at the OJT office, Pangasinan State University – Lingayen Campus. The
            coordinator creates every account, so a supervisor or trainee without one asks there. A forgotten password can be
            reset from each role&rsquo;s sign-in page.
          </p>
        </section>

        <section aria-labelledby="about" className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:p-7">
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
