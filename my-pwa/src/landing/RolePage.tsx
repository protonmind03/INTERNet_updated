import { HELP_ANSWERS } from "../lib/helpAnswers";
import { AndroidMark, AppleMark, BackToTop, Footer, Glyph, TopBar } from "./Chrome";
import { ICON } from "./icons";
import { DOOR_ROLES, DOORS, HOW_STEPS, INSTALL_DEVICES, ROLE_DEVICE, ROLE_PAGES, ROLE_PAGE_PATH, doorPath, installPath, type DoorRole, type RoleFeature } from "./content";
import { Device, StepScreen } from "./Screens";

/*
|--------------------------------------------------------------------------
| A ROLE'S OWN PAGE: /for-trainees, /for-supervisors, /for-coordinators
|--------------------------------------------------------------------------
|
| Rendered to plain HTML when the site is built, like the landing page,
| and enhanced by the same script (main.ts). Hallmark redesign, second
| round (2026-11-21): five plain parts, each answering one question.
|
|   1. What is it?          the hero: the portal on its device, sign in
|   2. What can I do?       the six things the portal does, laid out the
|                           way the role works (a checklist beside the
|                           trainee's phone, a task board under the
|                           supervisor's tablet, a list of what the
|                           coordinator's console does, one row each)
|   3. What is a day like?  the four steps, as a timeline, a schedule or a
|                           week
|   4. How do I start?      get an account, sign in, install (the device
|                           the visitor is on is detected; main.ts)
|   5. Questions            from the Help centre's own answers
|
| The figures on the screens are examples.
|
*/

const FEATURE_ICON: Record<RoleFeature["icon"], string> = {
  camera: ICON.camera,
  offline: "M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18",
  road: "M4 20L9 4M20 20L15 4M12 6v2M12 11v2M12 16v2",
  tasks: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  report: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  board: "M3 4h18v12H3zM8 20h8M12 16v4M7 8h4M7 11h7",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  audit: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 13l2 2 4-4",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};

const DEVICE_ART = { android: <AndroidMark />, ios: <AppleMark />, desktop: <Glyph d={ICON.computer} size={26} /> };
const CHIP_ICON = { Phone: ICON.phone, Tablet: ICON.tablet, Computer: ICON.computer } as const;

/* ---------- 2. What you can do: one layout per role ---------- */

function FeatureIcon({ feature }: { feature: RoleFeature }) {
  return (
    <span className="rp2-icon" aria-hidden="true">
      <Glyph d={FEATURE_ICON[feature.icon]} size={20} />
    </span>
  );
}

/** The trainee: a checklist of what the app does, beside the phone that does it. */
function TraineeCanDo({ features }: { features: RoleFeature[] }) {
  return (
    <div className="rp2-check">
      <div className="rp2-check-device" aria-hidden="true">
        <Device role="student" kind="phone">
          <StepScreen role="student" step={1} />
        </Device>
      </div>
      <ul className="rp2-check-list">
        {features.map((feature) => (
          <li key={feature.title}>
            <span className="rp2-tick" aria-hidden="true">
              <Glyph d="M5 12l4 4L19 6" size={16} stroke={2.6} />
            </span>
            <span>
              <b>{feature.title}</b>
              <i>{feature.body}</i>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The supervisor: the tablet on the desk, and the jobs it does as a board of tasks. */
function SupervisorCanDo({ features }: { features: RoleFeature[] }) {
  return (
    <div className="rp2-board">
      <div className="rp2-board-device" aria-hidden="true">
        <Device role="supervisor" kind="tablet">
          <StepScreen role="supervisor" step={2} />
        </Device>
      </div>
      <ul className="rp2-board-grid">
        {features.map((feature) => (
          <li key={feature.title}>
            <FeatureIcon feature={feature} />
            <b>{feature.title}</b>
            <i>{feature.body}</i>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The coordinator: the console on the laptop, and what it does, one row each. */
function CoordinatorCanDo({ features }: { features: RoleFeature[] }) {
  return (
    <div className="rp2-spec">
      <div className="rp2-spec-device" aria-hidden="true">
        <Device role="coordinator" kind="laptop">
          <StepScreen role="coordinator" step={2} />
        </Device>
      </div>
      <dl className="rp2-spec-list">
        {features.map((feature) => (
          <div key={feature.title}>
            <dt>
              <FeatureIcon feature={feature} />
              {feature.title}
            </dt>
            <dd>{feature.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------- 3. The role's day: one layout per role ---------- */

/** When each step happens, as an example day or week. */
const DAY_TIMES: Record<DoorRole, [string, string, string, string]> = {
  student: ["7:58 AM", "12:00 to 5:02 PM", "During the week", "Every verified day"],
  supervisor: ["8:15 AM", "9:00 AM", "After lunch", "End of the month"],
  coordinator: ["Mon", "Tue", "Wed", "Fri"],
};

type Step = { title: string; body: string };

/** The trainee: four stops along one line, left to right. */
function TraineeDay({ steps }: { steps: Step[] }) {
  return (
    <ol className="rp2-line">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="rp2-line-when">{DAY_TIMES.student[index]}</span>
          <span className="rp2-line-dot" aria-hidden="true">
            {index + 1}
          </span>
          <b>{step.title}</b>
          <i>{step.body}</i>
        </li>
      ))}
    </ol>
  );
}

/** The supervisor: the day as a schedule, a time and a job on each row. */
function SupervisorDay({ steps }: { steps: Step[] }) {
  return (
    <ol className="rp2-schedule">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="rp2-schedule-when">{DAY_TIMES.supervisor[index]}</span>
          <span className="rp2-schedule-what">
            <b>{step.title}</b>
            <i>{step.body}</i>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The coordinator: a working week, each step on its day. */
function CoordinatorWeek({ steps }: { steps: Step[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <ol className="rp2-week">
      {days.map((day) => {
        const index = DAY_TIMES.coordinator.indexOf(day);
        const step = index >= 0 ? steps[index] : null;
        return (
          <li key={day} className={step ? "" : "rp2-week-free"}>
            <span className="rp2-week-day">{day}</span>
            {step && (
              <>
                <b>{step.title}</b>
                <i>{step.body}</i>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- 4. How to start: an account, a sign-in, the app ---------- */

type InstallKey = (typeof INSTALL_DEVICES)[number]["key"];

/** The order of the device tiles, and their names, after the device each role works on. */
const INSTALL_ORDER: Record<DoorRole, InstallKey[]> = {
  student: ["android", "ios", "desktop"],
  supervisor: ["desktop", "android", "ios"],
  coordinator: ["desktop", "android", "ios"],
};
const INSTALL_LABEL: Partial<Record<DoorRole, Partial<Record<InstallKey, string>>>> = {
  supervisor: { android: "Android tablet or phone", ios: "iPad or iPhone" },
  coordinator: { android: "Android phone", ios: "iPhone" },
};

/*
| Install (Hallmark redesign, 2026-11-21): two columns. On the left, what
| this is and what the visitor needs first (an account from the OJT
| coordinator); on the right, one installer: the device (detected by
| main.ts, changeable), its three steps, and one button, with the QR code
| on a computer. One set of numbered steps, one brass button.
*/
function Start({ role }: { role: DoorRole }) {
  const door = DOORS[role];
  const order = INSTALL_ORDER[role].map((key) => INSTALL_DEVICES.find((device) => device.key === key)!);
  return (
    <section id="install" className={`land-section rp3-install role-install--${role}`} aria-labelledby="install-title" data-download data-role={role} data-fixed-role={role}>
      <div className="land-wrap rp3-grid">
        <div className="rp3-intro">
          <h2 id="install-title" className="land-h2 land-h2--light">
            Install INTERNet for {door.plural}
          </h2>
          <p className="land-lede land-lede--light">{ROLE_PAGES[role].installLead}</p>
          <div className="rp3-need">
            <span className="rp3-need-icon" aria-hidden="true">
              <Glyph d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0" size={18} />
            </span>
            <span>
              <b>Before you install</b>
              <i>Your OJT coordinator creates your account. Sign in with the details they gave you.</i>
              <a href={doorPath(role)} className="rp3-link">
                Sign in as a {door.name.toLowerCase()}
              </a>
            </span>
          </div>
        </div>

        <div className="rp3-panel">
          {/* "You're on a computer…": the detected device, said first (main.ts). */}
          <div className="install-card" data-install-card>
            <span className="install-card-tile" data-install-art>
              <Glyph d={ICON.phone} size={20} />
            </span>
            <span className="install-card-words">
              <b data-install-title>Install INTERNet on your device.</b>
              <i data-install-sub>The steps for your device are shown below.</i>
            </span>
          </div>

          <div role="radiogroup" aria-label="Your device" className="get-devices">
            {order.map((device, index) => (
              <label key={device.key} className="get-device" data-device-tile={device.key}>
                <input type="radio" name="download-device" value={device.key} defaultChecked={index === 0} />
                <span className="get-device-art">{DEVICE_ART[device.key]}</span>
                <span>
                  <b>{INSTALL_LABEL[role]?.[device.key] ?? device.label}</b>
                  <i>{device.browsers}</i>
                </span>
                <span className="get-detected" hidden data-detected={device.key}>
                  Detected
                </span>
              </label>
            ))}
          </div>

          {order.map((device) => (
            <div key={device.key} className="get-steps" data-device={device.key}>
              <ol>
                {device.steps.map((step, index) => (
                  <li key={step.title}>
                    <span className="get-n">{index + 1}</span>
                    <span>
                      <b>{step.title}</b>
                      <i>{step.body}</i>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="get-actions">
                <a className="get-install" data-install-link href={installPath(role)}>
                  <span>Open the</span>
                  <span data-door-name>{door.name.toLowerCase()}</span>
                  <span>sign-in to install</span>
                </a>
                {device.key === "ios" && (
                  <p className="get-warning" data-not-safari hidden>
                    These steps are for Safari. If Add to Home Screen is missing from this browser&rsquo;s Share menu, open the page in Safari.
                  </p>
                )}
                {device.key === "desktop" && (
                  <div className="get-qr">
                    <div className="get-qr-code" data-qr aria-hidden="true" />
                    <p>
                      Or scan this with your phone to open the <span data-door-name>{door.name.toLowerCase()}</span> sign-in there.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const DAY_LEAD: Record<DoorRole, string> = {
  student: "From the camera check in the morning to the hours that count, all on your phone.",
  supervisor: "A morning at the desk: who is in, what to verify, what to review, and the end of the month.",
  coordinator: "The week in the console: what needs you, decisions, setup and the dean's report.",
};

export default function RolePage({ role }: { role: DoorRole }) {
  const door = DOORS[role];
  const page = ROLE_PAGES[role];
  const day = HOW_STEPS[role];
  const questions = HELP_ANSWERS.filter((answer) => answer.roles.includes(role)).slice(0, 5);
  const others = DOOR_ROLES.filter((other) => other !== role);
  return (
    <>
      <a className="land-skip" href="#main">
        Skip to content
      </a>
      <span id="top" />
      <TopBar page={role} />
      <main id="main" data-role={role} className={`role-page rp2 rp2--${role}`}>
        {/* 1. What is it? */}
        <section className="role-hero" aria-labelledby="role-title" data-hero>
          {/* Each role's own backdrop: the camera check's oval, a logbook's ruled page, a route on a map (role.css). */}
          <span className={`rp2-hero-bg rp2-hero-bg--${role}`} aria-hidden="true">
            {role === "coordinator" && (
              <svg className="rp2-route" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
                <path d="M-20 470 C 180 430, 260 300, 420 320 S 640 470, 780 360 S 980 140, 1220 170" />
                {[
                  [140, 448],
                  [420, 320],
                  [700, 410],
                  [900, 230],
                  [1110, 160],
                ].map(([x, y]) => (
                  <circle key={x} cx={x} cy={y} r="9" />
                ))}
              </svg>
            )}
          </span>
          <div className="land-wrap role-hero-row">
            <div className="role-hero-copy">
              <h1 id="role-title" className="role-title">
                {page.title} <em>{page.titleEm}</em>
              </h1>
              <p className="role-intro">{page.intro}</p>
              <p className="role-cta">
                <a href={doorPath(role)} className="role-cta-primary">
                  Sign in as a {door.name.toLowerCase()}
                </a>
                <a href="#install" className="role-cta-secondary">
                  Install the app
                </a>
              </p>
              <ul className="role-best" aria-label="Best on">
                <li className="role-best-label" aria-hidden="true">
                  Best on
                </li>
                {(["Phone", "Tablet", "Computer"] as const).map((device) => (
                  <li key={device} className={door.best.includes(device) ? "on" : ""}>
                    <Glyph d={CHIP_ICON[device]} size={14} />
                    {device}
                    {door.best.includes(device) && <span className="sr-only"> (best)</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="role-hero-art" aria-hidden="true" data-device={ROLE_DEVICE[role]}>
              <Device role={role} kind={ROLE_DEVICE[role]} />
            </div>
          </div>
        </section>

        {/* 2. What can I do? */}
        {/* No visible heading (the user asked to remove it); the section keeps its name for screen readers. */}
        <section className="land-section rp2-can" aria-label="What you can do">
          <div className="land-wrap">
            <div className="land-head">
              <p className="land-lede">{door.deviceWhy}</p>
            </div>
            {role === "student" ? <TraineeCanDo features={page.features} /> : role === "supervisor" ? <SupervisorCanDo features={page.features} /> : <CoordinatorCanDo features={page.features} />}
          </div>
        </section>

        {/* 3. What is a day like? */}
        <section className="land-section rp2-day" aria-labelledby="role-day-title">
          <div className="land-wrap">
            <div className="land-head">
              <h2 id="role-day-title" className="land-h2">
                {day.title}
              </h2>
              <p className="land-lede">{DAY_LEAD[role]}</p>
            </div>
            {role === "student" ? <TraineeDay steps={day.steps} /> : role === "supervisor" ? <SupervisorDay steps={day.steps} /> : <CoordinatorWeek steps={day.steps} />}
          </div>
        </section>

        {/* 4. How do I start? */}
        <Start role={role} />

        {/* 5. Questions */}
        <section className="land-section rp2-faq" aria-labelledby="role-faq-title">
          <div className="land-wrap role-faq">
            <div>
              <h2 id="role-faq-title" className="land-h2">
                Questions {door.plural} ask
              </h2>
              <p className="land-lede">
                More answers in the <a href={`/help?role=${role}`}>Help centre</a>.
              </p>
              <p className="rp2-others">
                <span>Not a {door.name.toLowerCase()}?</span>
                {others.map((other) => (
                  <a key={other} href={ROLE_PAGE_PATH[other]}>
                    For {DOORS[other].plural}
                  </a>
                ))}
              </p>
            </div>
            <div className="role-faq-list">
              {questions.map((answer) => (
                <details key={answer.id} className="role-faq-item">
                  <summary>
                    <span>
                      <i>{answer.topic}</i>
                      <b>{answer.question}</b>
                    </span>
                    <span className="role-faq-mark" aria-hidden="true" />
                  </summary>
                  <p>{answer.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
