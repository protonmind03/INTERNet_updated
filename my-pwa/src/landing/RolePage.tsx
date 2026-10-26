import type { ReactNode } from "react";
import BrandIcon from "../brand/BrandIcon";
import { BRAND } from "../brand/geometry";
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
| and enhanced by the same script (main.ts). What the role's portal does,
| the role's day, and installing the role's app, with the device the
| visitor is on detected and said first ("You're on a computer…"). Common
| questions come from the Help centre's own answers (lib/helpAnswers.ts).
|
| Each role's page is drawn around the device that role works on (fix
| 10-26): the trainee's around a phone (features orbiting it, a day on a
| clock, phone-shaped install steps), the supervisor's around a tablet (a
| bento board, a shift track of tablet screens), the coordinator's around
| a laptop (the features as a console, the week as a calendar, install
| steps in a browser window). The figures on the screens are examples.
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

/* ---------- What the app does: one layout per role ---------- */

function FeatureIcon({ feature }: { feature: RoleFeature }) {
  return (
    <span className="role-feature-icon">
      <Glyph d={FEATURE_ICON[feature.icon]} size={22} />
    </span>
  );
}

/** The trainee: the phone in the middle, the six features around it. */
function TraineeFeatures({ features }: { features: RoleFeature[] }) {
  const side = (list: RoleFeature[], from: number, align: "left" | "right") => (
    <ul className={`rp-orbit-list rp-orbit-list--${align}`}>
      {list.map((feature, index) => (
        <li key={feature.title} className="rp-orbit-item" style={{ ["--i" as string]: from + index }}>
          <FeatureIcon feature={feature} />
          <span>
            <b>{feature.title}</b>
            <i>{feature.body}</i>
          </span>
          <span className="rp-orbit-link" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="rp-orbit">
      {side(features.slice(0, 3), 0, "left")}
      <div className="rp-orbit-phone" aria-hidden="true">
        <span className="rp-orbit-rings">
          <span />
          <span />
          <span />
        </span>
        <Device role="student" kind="phone" />
        <span className="rp-orbit-badge rp-orbit-badge--1">
          <Glyph d={ICON.camera} size={14} /> 7:58 AM · camera check passed
        </span>
        <span className="rp-orbit-badge rp-orbit-badge--2">
          <Glyph d={ICON.check} size={14} /> Day verified
        </span>
      </div>
      {side(features.slice(3), 3, "right")}
    </div>
  );
}

/** The supervisor: a bento board with the tablet in its largest tile. */
function SupervisorFeatures({ features }: { features: RoleFeature[] }) {
  return (
    <ul className="rp-bento">
      <li className="rp-bento-hero" aria-hidden="true">
        <span className="rp-bento-hero-head">
          <span className="rp-live" />
          Review · today
        </span>
        <Device role="supervisor" kind="tablet" />
        <span className="rp-bento-hero-foot">
          <b>6</b> waiting · oldest first
        </span>
      </li>
      {features.map((feature, index) => (
        <li key={feature.title} className={`rp-bento-tile${index >= 4 ? " rp-bento-tile--wide" : ""}`} style={{ ["--i" as string]: index }}>
          <FeatureIcon feature={feature} />
          <b>{feature.title}</b>
          <i>{feature.body}</i>
        </li>
      ))}
    </ul>
  );
}

/** A small picture inside each console widget, after what the feature is. */
function WidgetArt({ icon }: { icon: RoleFeature["icon"] }) {
  if (icon === "alert")
    return (
      <span className="rp-w-list">
        <span>
          <em className="bad" />
          Appeal · 2 days old
        </span>
        <span>
          <em className="warn" />
          Flagged log · clock
        </span>
        <span>
          <em />
          No supervisor yet
        </span>
      </span>
    );
  if (icon === "filter")
    return (
      <span className="rp-w-chips">
        <em className="on">2026 · 1st term</em>
        <em>CCS</em>
        <em className="on">BSIT</em>
        <em>Block A</em>
        <em>Company</em>
      </span>
    );
  if (icon === "calendar")
    return (
      <span className="rp-w-cal">
        {Array.from({ length: 21 }, (_, i) => (
          <em key={i} className={i === 9 ? "hol" : i % 7 > 4 ? "off" : i < 12 ? "on" : ""} />
        ))}
      </span>
    );
  if (icon === "chart")
    return (
      <span className="rp-w-bars">
        {[54, 72, 64, 88, 76, 94, 82].map((height, i) => (
          <em key={i} style={{ height: `${height}%`, ["--i" as string]: i }} />
        ))}
      </span>
    );
  if (icon === "audit")
    return (
      <span className="rp-w-log">
        <span>
          <code>09:14</code> Time-out corrected
        </span>
        <span>
          <code>10:02</code> Block moved
        </span>
        <span>
          <code>11:47</code> Appeal decided
        </span>
      </span>
    );
  return (
    <span className="rp-w-chat">
      <em>Orientation is on Monday.</em>
      <em className="me">Noted, sent to all.</em>
    </span>
  );
}

/** The coordinator: the features as the console itself, on a laptop. */
function CoordinatorFeatures({ features }: { features: RoleFeature[] }) {
  return (
    <div className="rp-console">
      <div className="rp-console-screen">
        <div className="rp-console-bar" aria-hidden="true">
          <span className="rp-console-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="rp-console-url">internet.psu.edu.ph/coordinator</span>
        </div>
        <div className="rp-console-body">
          <nav className="rp-console-side" aria-hidden="true">
            <span className="rp-console-brand">
              <BrandIcon size={22} tile={BRAND.amber} fg={BRAND.navy} />
              Console
            </span>
            {features.map((feature, index) => (
              <span key={feature.title} className={index === 0 ? "rp-console-nav on" : "rp-console-nav"}>
                <Glyph d={FEATURE_ICON[feature.icon]} size={14} />
                {feature.title}
              </span>
            ))}
          </nav>
          <ul className="rp-console-grid">
            {features.map((feature, index) => (
              <li key={feature.title} className="rp-widget" style={{ ["--i" as string]: index }}>
                <span className="rp-widget-head">
                  <FeatureIcon feature={feature} />
                  <b>{feature.title}</b>
                </span>
                <i>{feature.body}</i>
                <span className="rp-widget-art" aria-hidden="true">
                  <WidgetArt icon={feature.icon} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <span className="rp-console-base" aria-hidden="true" />
    </div>
  );
}

/* ---------- The role's day: one layout per role ---------- */

/** When each step happens, as an example day or week. */
const DAY_TIMES: Record<DoorRole, [string, string, string, string]> = {
  student: ["7:58 AM", "12:00 – 5:02 PM", "During the week", "Every verified day"],
  supervisor: ["8:15 AM", "9:00 AM", "After lunch", "End of the month"],
  coordinator: ["Mon", "Tue", "Wed", "Fri"],
};

/** The trainee: a day on a timeline, a phone beside each step. */
function TraineeDay({ steps }: { steps: Array<{ title: string; body: string }> }) {
  return (
    <ol className="rp-timeline">
      {steps.map((step, index) => (
        <li key={step.title} className="rp-timeline-step" style={{ ["--i" as string]: index }}>
          <span className="rp-timeline-time">{DAY_TIMES.student[index]}</span>
          <span className="rp-timeline-node" aria-hidden="true">
            {index + 1}
          </span>
          <span className="rp-timeline-card">
            <span className="rp-timeline-words">
              <b>{step.title}</b>
              <i>{step.body}</i>
            </span>
            <span className="rp-timeline-phone" aria-hidden="true">
              <span className="dev dev--phone dev--mini" data-role="student">
                <span className="dev-screen">
                  <StepScreen role="student" step={index + 1} />
                </span>
              </span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The supervisor: a shift track, a tablet screen on each stop. */
function SupervisorDay({ steps }: { steps: Array<{ title: string; body: string }> }) {
  return (
    <ol className="rp-track">
      {steps.map((step, index) => (
        <li key={step.title} className="rp-track-step" style={{ ["--i" as string]: index }}>
          <span className="rp-track-screen" aria-hidden="true">
            <span className="dev dev--tablet" data-role="supervisor">
              <span className="dev-screen">
                <StepScreen role="supervisor" step={index + 1} />
              </span>
            </span>
          </span>
          <span className="rp-track-stop">
            <span className="rp-track-node" aria-hidden="true">
              {index + 1}
            </span>
            <span className="rp-track-time">{DAY_TIMES.supervisor[index]}</span>
          </span>
          <b>{step.title}</b>
          <i>{step.body}</i>
        </li>
      ))}
    </ol>
  );
}

/** The coordinator: a week calendar, each step an event on its day. */
function CoordinatorDay({ steps }: { steps: Array<{ title: string; body: string }> }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="rp-week">
      <div className="rp-week-head" aria-hidden="true">
        {days.map((day, index) => (
          <span key={day}>
            <b>{day}</b>
            <i>{index + 20}</i>
          </span>
        ))}
      </div>
      <ol className="rp-week-grid">
        {steps.map((step, index) => {
          const column = days.indexOf(DAY_TIMES.coordinator[index]) + 1;
          return (
            <li key={step.title} className="rp-week-event" style={{ gridColumn: column, gridRow: index % 2 === 0 ? "1 / span 2" : "2 / span 2", ["--i" as string]: index }}>
              <span className="rp-week-when">
                <span className="rp-week-n">{index + 1}</span>
                {DAY_TIMES.coordinator[index]}
              </span>
              <span className="rp-week-screen" aria-hidden="true">
                <span className="dev dev--laptop" data-role="coordinator">
                  <span className="dev-screen">
                    <StepScreen role="coordinator" step={index + 1} />
                  </span>
                </span>
              </span>
              <b>{step.title}</b>
              <i>{step.body}</i>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- Installing the role's app ---------- */

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

/** One install step drawn in the frame it happens in: a phone, a tablet, or a browser window. */
function InstallArt({ role, device, step }: { role: DoorRole; device: InstallKey; step: number }) {
  const frame = device === "desktop" ? "window" : role === "supervisor" ? "tablet" : "phone";
  let inner: ReactNode;
  if (step === 3) {
    inner = (
      <span className="ia-home">
        {device === "desktop" ? (
          <>
            <span className="ia-taskbar">
              <em />
              <em />
              <BrandIcon size={22} tile={BRAND.amber} fg={BRAND.navy} />
              <em />
            </span>
            <i>INTERNet {DOORS[role].name}</i>
          </>
        ) : (
          <>
            <span className="ia-apps">
              <em />
              <em />
              <em />
              <BrandIcon size={34} tile={BRAND.amber} fg={BRAND.navy} />
              <em />
              <em />
            </span>
            <i>INTERNet</i>
          </>
        )}
      </span>
    );
  } else if (step === 2) {
    inner = (
      <span className="ia-dialog">
        <b>{device === "ios" ? "Add to Home Screen" : "Install app?"}</b>
        <span className="ia-dialog-app">
          <BrandIcon size={22} tile={BRAND.amber} fg={BRAND.navy} />
          <i>INTERNet {DOORS[role].name}</i>
        </span>
        <span className="ia-dialog-actions">
          <em>Cancel</em>
          <em className="go">{device === "ios" ? "Add" : "Install"}</em>
        </span>
      </span>
    );
  } else {
    inner = (
      <span className="ia-page">
        <span className="ia-bar">
          <i>{device === "desktop" ? "internet…/sign-in" : "sign-in"}</i>
          <b>{device === "ios" ? "⬆" : device === "desktop" ? "⊕" : "⋮"}</b>
        </span>
        <span className="ia-lines">
          <em />
          <em />
        </span>
        <span className="ia-cta">{device === "ios" ? "Share" : "Install the app"}</span>
      </span>
    );
  }
  return (
    <span className={`ia ia--${frame}`} aria-hidden="true">
      {frame === "window" && (
        <span className="ia-window-dots">
          <em />
          <em />
          <em />
        </span>
      )}
      <span className="ia-screen">{inner}</span>
    </span>
  );
}

function Install({ role }: { role: DoorRole }) {
  const door = DOORS[role];
  const order = INSTALL_ORDER[role].map((key) => INSTALL_DEVICES.find((device) => device.key === key)!);
  return (
    <section id="install" className={`land-section role-install role-install--${role}`} aria-labelledby="install-title" data-download data-role={role} data-fixed-role={role}>
      <span className="role-install-motif" aria-hidden="true" />
      <div className="land-wrap">
        <div className="role-install-head">
          <div>
            <p className="land-eyebrow role-install-eyebrow">Get the app</p>
            <h2 id="install-title" className="land-h2 land-h2--light">
              Install INTERNet for {door.plural}
            </h2>
            <p className="land-lede land-lede--light">{ROLE_PAGES[role].installLead} Pick your device; the one you&rsquo;re on is chosen for you.</p>
          </div>
          {/* "You're on a computer…": the detected device, said first (main.ts). */}
          <div className="install-card" data-install-card>
            <span className="install-card-tile" data-install-art>
              <Glyph d={ICON.phone} size={26} />
            </span>
            <span className="install-card-words">
              <b data-install-title>Install INTERNet on your device.</b>
              <i data-install-sub>The steps for your device are shown below.</i>
            </span>
            <a className="install-card-button" href={installPath(role)} data-install-go>
              Install the {door.name.toLowerCase()} app
            </a>
          </div>
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
                <li key={step.title} style={{ ["--i" as string]: index }}>
                  <InstallArt role={role} device={device.key} step={index + 1} />
                  <span className="get-n">{index + 1}</span>
                  <b>{step.title}</b>
                  <i>{step.body}</i>
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
      <main id="main" data-role={role} className="role-page">
        <section className="role-hero" aria-labelledby="role-title" data-hero>
          <div className="land-wrap role-hero-row">
            <div className="role-hero-copy">
              <p className="role-kicker">
                <span className="land-dot" aria-hidden="true" />
                {page.kicker}
              </p>
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

        <section className={`land-section rp-features rp-features--${role}`} aria-labelledby="role-features">
          <div className="land-wrap">
            <div className="land-head">
              <p className="land-eyebrow rp-eyebrow">What the {door.cardTitle.toLowerCase()} does</p>
              <h2 id="role-features" className="land-h2">
                Everything a {door.name.toLowerCase()} needs, in one app
              </h2>
              <p className="land-lede">{door.deviceWhy}</p>
            </div>
            {role === "student" ? (
              <TraineeFeatures features={page.features} />
            ) : role === "supervisor" ? (
              <SupervisorFeatures features={page.features} />
            ) : (
              <CoordinatorFeatures features={page.features} />
            )}
          </div>
        </section>

        <section className={`land-section rp-day rp-day--${role}`} aria-labelledby="role-day-title">
          <div className="land-wrap">
            <div className="land-head">
              <p className="land-eyebrow rp-eyebrow">{day.title}</p>
              <h2 id="role-day-title" className="land-h2">
                Four steps, every {day.title.endsWith("week") ? "week" : "day"}
              </h2>
              <p className="land-lede">{DAY_LEAD[role]}</p>
            </div>
            {role === "student" ? <TraineeDay steps={day.steps} /> : role === "supervisor" ? <SupervisorDay steps={day.steps} /> : <CoordinatorDay steps={day.steps} />}
          </div>
        </section>

        <Install role={role} />

        <section className="land-section land-section--white" aria-labelledby="role-faq-title">
          <div className="land-wrap role-faq">
            <div>
              <p className="land-eyebrow">Questions {door.plural} ask</p>
              <h2 id="role-faq-title" className="land-h2">
                Good to know
              </h2>
              <p className="land-lede">
                More answers in the <a href={`/help?role=${role}`}>Help centre</a>.
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

        <section className="role-final" aria-labelledby="role-final-title">
          <div className="land-wrap role-final-row">
            <div>
              <h2 id="role-final-title" className="role-final-title">
                Ready to start?
              </h2>
              <p>Your OJT coordinator creates your account. Sign in with the details they gave you.</p>
            </div>
            <p className="role-final-actions">
              <a href={doorPath(role)} className="role-cta-primary">
                Sign in as a {door.name.toLowerCase()}
                <Glyph d={ICON.arrow} size={18} />
              </a>
              <span className="role-final-others">
                Not a {door.name.toLowerCase()}?{" "}
                {others.map((other, index) => (
                  <span key={other}>
                    {index > 0 && " · "}
                    <a href={ROLE_PAGE_PATH[other]}>For {DOORS[other].plural}</a>
                  </span>
                ))}
              </span>
            </p>
          </div>
        </section>
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
