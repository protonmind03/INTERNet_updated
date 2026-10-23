import BrandIcon from "../brand/BrandIcon";
import PsuSeal from "../brand/PsuSeal";
import Wordmark from "../brand/Wordmark";
import { BRAND } from "../brand/geometry";
import { DOOR_ROLES, DOORS, FOOL, HERO_ORDER, HOW_STEPS, INSTALL_DEVICES, doorPath, installPath, type DoorRole } from "./content";
import { Device, PortalScreen } from "./Screens";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE (PSU redesign, Sections 1 to 5 and 9)
|--------------------------------------------------------------------------
|
| Rendered to plain HTML when the site is built (render.tsx); none of this
| runs in the browser. src/landing/main.ts adds what needs a script: the
| hero's turning circle of roles and devices, the role tabs of "How it
| works", the "Try to fool it" picker, the device detection of "Get the
| app" and the footer's install card. Without it the page still reads top
| to bottom.
|
| Order: the hero (1D), three portals and the PSU strip (1E), how it works
| (2A), get the app (3B), what the system checks (4C), the footer (9B).
|
| It imports only the brand kit and its own files: never the signed-in
| app, the camera check or the offline store.
|
*/

function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  prev: "M15 18l-6-6 6-6",
  next: "M9 6l6 6-6 6",
  swap: "M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  tablet: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2",
  computer: "M4 5h16v10H4zM2 19h20",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  check: "M5 12l4 4L19 6",
  up: "M12 19V5M5 12l7-7 7 7",
};

/** The Android robot's head and the Apple logo, the platforms' own marks, drawn flat. */
function AndroidMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.1a11.4 11.4 0 0 0-4.92 1.04L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.7 10.7 0 0 0 1 18h22a10.7 10.7 0 0 0-5.4-8.52zM7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25z" />
    </svg>
  );
}

function AppleMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.37 12.7c-.02-2.24 1.83-3.32 1.91-3.37-1.04-1.52-2.66-1.73-3.24-1.75-1.38-.14-2.69.81-3.39.81-.7 0-1.78-.79-2.92-.77-1.5.02-2.89.87-3.66 2.21-1.56 2.71-.4 6.72 1.12 8.92.74 1.08 1.63 2.29 2.79 2.24 1.12-.04 1.54-.72 2.89-.72 1.35 0 1.73.72 2.91.7 1.2-.02 1.96-1.1 2.7-2.18.85-1.25 1.2-2.46 1.22-2.52-.03-.01-2.33-.9-2.35-3.56zM14.15 6.1c.62-.75 1.03-1.78.92-2.82-.89.04-1.97.59-2.6 1.34-.57.66-1.07 1.71-.94 2.73.99.08 2-.5 2.62-1.25z" />
    </svg>
  );
}

const DEVICE_ART = { android: <AndroidMark />, ios: <AppleMark />, desktop: <Glyph d={ICON.computer} size={26} /> };

/** The seal as a coin: the PSU seal on one face, INTERNet's mark on the other. Turns slowly; still under reduced motion. */
function SealCoin({ size = 56 }: { size?: number }) {
  return (
    <span className="coin" style={{ width: size, height: size }}>
      <span className="coin-face coin-front">
        <PsuSeal size={size - 6} clearSpace={false} />
      </span>
      <span className="coin-face coin-back" aria-hidden="true">
        <BrandIcon size={Math.round(size * 0.62)} />
      </span>
    </span>
  );
}

/** "i": the card's explanation, shown after a 0.6 s hover or on focus (main.ts), as the app's InfoTip does. */
function Info({ text, label }: { text: string; label: string }) {
  return (
    <span className="land-info">
      <button type="button" className="land-info-button" aria-label={label} data-info>
        <span aria-hidden="true">i</span>
      </button>
      <span role="tooltip" className="land-tip" hidden>
        {text}
      </span>
    </span>
  );
}

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#portal-student", label: "For trainees" },
  { href: "#portal-supervisor", label: "For supervisors" },
  { href: "#portal-coordinator", label: "For coordinators" },
  { href: "/help", label: "Help" },
];

function SignInMenu({ id }: { id: string }) {
  return (
    <details className="land-signin">
      <summary className="land-signin-button" aria-controls={id}>
        Sign in
      </summary>
      <ul id={id} className="land-signin-list">
        {DOOR_ROLES.map((role) => (
          <li key={role} data-role={role}>
            <a href={doorPath(role)}>
              <span className="land-dot" aria-hidden="true" />
              {DOORS[role].name}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TopBar() {
  return (
    <header className="land-top">
      <div className="land-wrap land-top-row">
        <a href="/" className="land-logo" aria-label="INTERNet: home">
          <BrandIcon size={30} tile={BRAND.amber} fg={BRAND.navy} />
          <Wordmark height={15} tone="onDark" />
        </a>
        <span className="land-cobrand">
          <PsuSeal size={30} onDark clearSpace={false} />
          <span>
            <b>Pangasinan State University</b>
            <i>Lingayen Campus</i>
          </span>
        </span>
        <nav aria-label="Main" className="land-nav">
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <a className="land-navlink" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="land-top-actions">
          <SignInMenu id="land-signin-top" />
          <button type="button" className="land-menu-button" data-menu-open aria-haspopup="dialog" aria-controls="land-menu">
            <Glyph d={ICON.menu} />
            <span>Menu</span>
          </button>
        </span>
      </div>
      <dialog id="land-menu" className="land-sheet" aria-label="Menu">
        <div className="land-sheet-head">
          <span className="font-semibold">Menu</span>
          <button type="button" className="land-menu-button land-menu-button--light" data-menu-close>
            <Glyph d={ICON.close} />
            <span>Close</span>
          </button>
        </div>
        <ul className="land-sheet-list">
          {NAV.map((item) => (
            <li key={item.href}>
              <a className="land-sheet-link" href={item.href} data-menu-link>
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a className="land-sheet-link" href="#download" data-menu-link>
              Get the app
            </a>
          </li>
        </ul>
      </dialog>
    </header>
  );
}

/* ---------- 1D: the hero ---------- */

function Road() {
  return (
    <svg className="road" viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="road-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.18" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <path className="road-surface" d="M560 0 L640 0 L1200 420 L0 420 Z" />
      <path className="road-surface road-texture" d="M560 0 L640 0 L1200 420 L0 420 Z" filter="url(#road-grain)" />
      <path className="road-edge" d="M566 0 L40 420" />
      <path className="road-edge" d="M634 0 L1160 420" />
      <path className="road-dash" d="M600 0 L600 420" pathLength={100} />
      <path className="road-dash road-dash--side" d="M583 0 L330 420" pathLength={100} />
      <path className="road-dash road-dash--side" d="M617 0 L870 420" pathLength={100} />
      {[0.18, 0.38, 0.62, 0.9].map((t) => (
        <g key={t} className="road-posts">
          <rect x={560 - 530 * t - 4 - 40 * t} y={420 * t - 18 * (0.4 + t)} width={3 + 4 * t} height={18 * (0.4 + t)} rx="1" />
          <rect x={640 + 530 * t + 4 + 40 * t} y={420 * t - 18 * (0.4 + t)} width={3 + 4 * t} height={18 * (0.4 + t)} rx="1" />
        </g>
      ))}
    </svg>
  );
}

function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 60V44h40V34h22v10h30V26h18v-8h10v8h16v34h20V40h36V30h14v-6h8v6h20v30h30V36h44V22h12V12h6v10h14v38h26V42h40V30h24v30h18V38h30V26h8V16h4v10h10v34h22V44h44V32h18v28h24V40h30V28h10v-8h6v8h16v32h26V46h36V34h20v26h30V40h40V30h12V20h8v10h14v30h20V44h44V36h24v24h26V42h50V30h18v30h22V48h36V38h20v22H1200V60Z" />
    </svg>
  );
}

const STARS = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 46, s: i % 5 === 0 ? 2 : 1 }));

function Hero() {
  return (
    <section className="hero" aria-labelledby="land-title" data-hero>
      <div className="hero-sky" aria-hidden="true">
        {STARS.map((star, i) => (
          <span key={i} className="hero-star" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.s, height: star.s }} />
        ))}
      </div>
      <Skyline />
      <Road />
      <div className="land-wrap hero-copy">
        <h1 id="land-title" className="hero-title">
          One system. <em>Every role, every screen.</em>
        </h1>
        <p className="hero-sub">
          <SealCoin size={52} />
          <span>
            The on-the-job training system of <b>Pangasinan State University</b>, installable on any phone, tablet or computer.
          </span>
        </p>
        {/* What to do next, in the first screen: open a portal, or install the app. */}
        <p className="hero-cta">
          <a href="#doors" className="hero-cta-primary">
            Open your portal
          </a>
          <a href="#download" className="hero-cta-secondary">
            Get the app
          </a>
        </p>
        <ul className="hero-chips" aria-label="Show a role">
          {DOOR_ROLES.map((role) => (
            <li key={role}>
              <button type="button" className="hero-chip" data-role={role} data-hero-pick={role} aria-pressed={role === "student"}>
                {DOORS[role].name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="hero-stage" aria-label="The three portals on their devices">
        {HERO_ORDER.map((role, index) => {
          const pos = ["left", "center", "right"][index];
          const door = DOORS[role];
          return (
            <div key={role} className="hero-slot" data-role={role} data-pos={pos} data-device={door.heroDevice} data-hero-slot={role}>
              <button type="button" className="hero-device" data-hero-turn={role} aria-label={`Show the ${door.name} portal`} tabIndex={pos === "center" ? -1 : 0}>
                <Device role={role} kind={door.heroDevice} />
              </button>
              <span className="hero-shadow" aria-hidden="true" />
              {door.notes.map((note, i) => (
                <span key={note.title} className={`hero-note hero-note--${i + 1}`} aria-hidden={pos === "center" ? undefined : true}>
                  <span className="hero-note-icon">
                    <Glyph d={i === 0 ? ICON.camera : ICON.check} size={16} />
                  </span>
                  <span>
                    <b>{note.title}</b>
                    <i>{note.line}</i>
                  </span>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="land-wrap hero-controls">
        <p className="hero-caption" aria-live="polite" data-hero-caption>
          <span className="land-dot" data-role="student" aria-hidden="true" />
          <span>
            <b data-hero-role>Trainee</b>
            {" on a "}
            <span data-hero-device>phone</span>
          </span>
        </p>
        <div className="hero-buttons">
          <button type="button" className="hero-arrow" data-hero-prev aria-label="Previous role">
            <Glyph d={ICON.prev} />
          </button>
          <button type="button" className="hero-swap" data-hero-swap aria-describedby="hero-swap-hint">
            <Glyph d={ICON.swap} size={24} />
            <span className="sr-only">Switch device</span>
          </button>
          <button type="button" className="hero-arrow" data-hero-next aria-label="Next role">
            <Glyph d={ICON.next} />
          </button>
        </div>
        <p id="hero-swap-hint" className="hero-hint" data-hero-hint>
          Switch device · see the Trainee portal on a tablet
        </p>
        <ul className="hero-indicator" aria-label="Roles">
          {HERO_ORDER.map((role) => (
            <li key={role} data-role={role} data-hero-indicator={role} aria-current={role === "student" ? "true" : undefined}>
              {DOORS[role].name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 1E: three portals, one road ---------- */

const CHIP_ICON = { Phone: ICON.phone, Tablet: ICON.tablet, Computer: ICON.computer } as const;

function PortalCard({ role }: { role: DoorRole }) {
  const door = DOORS[role];
  return (
    <li>
      <article id={`portal-${role}`} data-role={role} className="portal" aria-labelledby={`portal-${role}-name`}>
        <div className="portal-cap">
          <span className="portal-first">{door.first}</span>
          <span className="portal-device" aria-hidden="true">
            <Device role={role} kind={door.heroDevice} />
          </span>
        </div>
        <div className="portal-body">
          <h3 id={`portal-${role}-name`} className="portal-title">
            {door.cardTitle}
          </h3>
          <ul className="portal-bullets">
            {door.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <div className="portal-chips">
            <ul aria-label="Devices">
              {(["Phone", "Tablet", "Computer"] as const).map((device) => (
                <li key={device} className={door.best.includes(device) ? "on" : ""}>
                  <Glyph d={CHIP_ICON[device]} size={14} />
                  {device}
                  {door.best.includes(device) && <span className="sr-only"> (best)</span>}
                </li>
              ))}
            </ul>
            <Info text={door.deviceWhy} label={`Why the ${door.cardTitle.toLowerCase()} suits these devices`} />
          </div>
          <a className="portal-get" href={installPath(role)}>
            {door.getApp}
          </a>
        </div>
      </article>
    </li>
  );
}

function Portals() {
  return (
    <section id="doors" className="land-section land-section--paper" aria-labelledby="doors-title">
      <div className="land-wrap">
        <div className="land-head">
          <p className="land-eyebrow">Three portals, one road</p>
          <h2 id="doors-title" className="land-h2">
            Each role gets an app made for how they work
          </h2>
          <p className="land-lede">Different colours, a different first screen, and the device that suits the job.</p>
        </div>
        <ul className="portals">
          {DOOR_ROLES.map((role) => (
            <PortalCard key={role} role={role} />
          ))}
        </ul>
        <div className="psu-strip">
          <SealCoin size={60} />
          <span className="psu-strip-words">
            <b>Part of the Pangasinan State University OJT program</b>
            <i>Lingayen Campus · trainee hours, sign-offs and records in one place</i>
          </span>
          <ul className="psu-strip-pills" aria-label="Works on">
            <li>Android</li>
            <li>iPhone and iPad</li>
            <li>Computers</li>
            <li>Works offline</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2A: how it works ---------- */

function HowItWorks() {
  return (
    <section id="how" className="land-section land-section--white" aria-labelledby="how-title" data-how>
      <div className="land-wrap">
        <div className="how-head">
          <div>
            <p className="land-eyebrow land-eyebrow--warm">How it works</p>
            <h2 id="how-title" className="land-h2">
              A <mark data-how-heading>{HOW_STEPS.student.heading}</mark> day
            </h2>
          </div>
          <div role="tablist" aria-label="Whose day" className="how-tabs">
            {DOOR_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                id={`how-tab-${role}`}
                aria-controls={`how-panel-${role}`}
                aria-selected={role === "student"}
                tabIndex={role === "student" ? 0 : -1}
                data-role={role}
                data-how-tab={role}
                className="how-tab"
              >
                <span className="land-dot" aria-hidden="true" />
                {DOORS[role].name}
              </button>
            ))}
          </div>
        </div>
        {DOOR_ROLES.map((role) => (
          <div
            key={role}
            id={`how-panel-${role}`}
            role="tabpanel"
            aria-labelledby={`how-tab-${role}`}
            data-how-panel={role}
            data-role={role}
            className="how-panel"
            hidden={role !== "student"}
          >
            <div className="how-phone" aria-hidden="true">
              <span className="dev dev--phone" data-role={role}>
                <span className="dev-screen">
                  <PortalScreen role={role} />
                </span>
              </span>
            </div>
            <ol className="how-steps">
              {HOW_STEPS[role].steps.map((step, index) => (
                <li key={step.title}>
                  <button type="button" className="how-step" data-how-step={index + 1} aria-current={index === 0 ? "step" : undefined}>
                    <span className="how-n">{index + 1}</span>
                    <span>
                      <b>{step.title}</b>
                      <i>{step.body}</i>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 3B: get the app ---------- */

function InstallArt({ device, step }: { device: string; step: number }) {
  if (step === 3) {
    return (
      <span className="install-art install-art--icon">
        <BrandIcon size={56} tile={BRAND.amber} fg={BRAND.navy} />
        <i>INTERNet</i>
      </span>
    );
  }
  if (step === 2) {
    return (
      <span className="install-art">
        <span className="install-dialog">
          <b>{device === "ios" ? "Add to Home Screen" : "Install app?"}</b>
          <i>INTERNet</i>
          <span>
            <em>Cancel</em>
            <em className="go">{device === "ios" ? "Add" : "Install"}</em>
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="install-art">
      <span className="install-bar">
        <i>INTERNet sign-in</i>
        <b aria-hidden="true">{device === "ios" ? "⬆" : "⋮"}</b>
      </span>
      <span className="install-cta">{device === "ios" ? "Share" : "Install the app"}</span>
    </span>
  );
}

function GetTheApp() {
  return (
    <section id="download" className="land-section land-section--navy" aria-labelledby="download-title" data-download data-role="student">
      <div className="land-wrap">
        <div role="radiogroup" aria-label="Which app" className="get-roles">
          {DOOR_ROLES.map((role, index) => (
            <label key={role} className="get-role">
              <input type="radio" name="download-role" value={role} defaultChecked={index === 0} />
              <span>{DOORS[role].name} app</span>
            </label>
          ))}
        </div>
        <h2 id="download-title" className="land-h2 land-h2--light get-title">
          Install INTERNet for <span data-plural>trainees</span>
        </h2>
        <p className="land-lede land-lede--light get-lede">Pick your device. The one you&rsquo;re on is chosen for you.</p>
        <div role="radiogroup" aria-label="Your device" className="get-devices">
          {INSTALL_DEVICES.map((device, index) => (
            <label key={device.key} className="get-device" data-device-tile={device.key}>
              <input type="radio" name="download-device" value={device.key} defaultChecked={index === 0} />
              <span className="get-device-art">{DEVICE_ART[device.key]}</span>
              <span>
                <b>{device.label}</b>
                <i>{device.browsers}</i>
              </span>
              <span className="get-detected" hidden data-detected={device.key}>
                Detected
              </span>
            </label>
          ))}
        </div>
        {INSTALL_DEVICES.map((device) => (
          <div key={device.key} className="get-steps" data-device={device.key}>
            <ol>
              {device.steps.map((step, index) => (
                <li key={step.title}>
                  <InstallArt device={device.key} step={index + 1} />
                  <span className="get-n">{index + 1}</span>
                  <b>{step.title}</b>
                  <i>{step.body}</i>
                </li>
              ))}
            </ol>
            <div className="get-actions">
              <a className="get-install" data-install-link href={installPath("student")}>
                {"Open the "}<span data-door-name>trainee</span>{" sign-in to install"}
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
                    Or scan this with your phone to open the <span data-door-name>trainee</span> sign-in there.
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

/* ---------- 4C: what the system checks ---------- */

function FoolScreen({ kind, title, line }: (typeof FOOL)[number]["screen"]) {
  return (
    <span className={`fool-screen fool-screen--${kind}`}>
      {kind === "camera" ? (
        <span className="fool-oval">
          <span className="fool-photo">Printed photo</span>
        </span>
      ) : (
        <span className="fool-card-icon">
          <Glyph d={kind === "queued" ? ICON.up : kind === "hours" ? ICON.check : kind === "confirm" ? "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" : kind === "redo" ? ICON.camera : "M12 8v5M12 16h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"} size={22} />
        </span>
      )}
      <b>{title}</b>
      <i>{line}</i>
    </span>
  );
}

function Checks() {
  const groups = ["Timing in", "During the day", "Afterwards"] as const;
  return (
    <section id="checks" className="checks" aria-labelledby="checks-title" data-fool>
      <div className="checks-list">
        <p className="land-eyebrow land-eyebrow--indigo">What the system checks</p>
        <h2 id="checks-title" className="land-h2">
          Go on, try to fool it.
        </h2>
        <p className="land-lede">Pick something a trainee might try. See what INTERNet does.</p>
        {groups.map((group) => (
          <div key={group}>
            <p className="checks-group">{group}</p>
            <ul>
              {FOOL.map((item, index) =>
                item.group === group ? (
                  <li key={item.try}>
                    <button type="button" className="fool-item" data-fool-pick={index} aria-pressed={index === 0} aria-controls="fool-panel">
                      <span className="fool-n">{String(index + 1).padStart(2, "0")}</span>
                      <b>{item.try}</b>
                      <i>{item.tag}</i>
                    </button>
                  </li>
                ) : null
              )}
            </ul>
          </div>
        ))}
      </div>
      <div id="fool-panel" className="checks-panel" aria-live="polite">
        {FOOL.map((item, index) => (
          <div key={item.try} className="fool-answer" data-fool-answer={index} hidden={index !== 0}>
            <span className="fool-phone" aria-hidden="true">
              <FoolScreen {...item.screen} />
            </span>
            <div className="fool-words">
              <span className={`fool-verdict fool-verdict--${item.verdict.toLowerCase()}`}>{item.verdict}</span>
              <h3 className="fool-answer-title">{item.answer}</h3>
              <div className="fool-box">
                <p className="fool-box-h">The rule</p>
                <p>{item.rule}</p>
              </div>
              {item.extra && (
                <div className="fool-box">
                  <p className="fool-box-h">{item.extra.title}</p>
                  <p>{item.extra.body}</p>
                </div>
              )}
              <div className="fool-box">
                <p className="fool-box-h">Checked by</p>
                <ul className="fool-by">
                  {(["Phone", "Server", "Supervisor", "Coordinator"] as const).map((who) => (
                    <li key={who} className={item.checkedBy.includes(who) ? "on" : ""}>
                      {who}
                      {!item.checkedBy.includes(who) && <span className="sr-only"> (not involved)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
        <p className="fool-legend">
          <b>Blocked</b> can&rsquo;t be done · <b>Handled</b> or <b>Spotted</b> by the rules · <b>Allowed</b>, honestly: it works, and it&rsquo;s visible
        </p>
      </div>
    </section>
  );
}

/* ---------- 9B: the footer, install first ---------- */

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="land-footer">
      <div className="land-wrap">
        <div className="install-card" data-install-card>
          <span className="install-card-tile" data-install-art>
            <Glyph d={ICON.phone} size={26} />
          </span>
          <span className="install-card-words">
            <b data-install-title>Install INTERNet on your device.</b>
            <i>Uses the same device check as Get the app.</i>
          </span>
          <a className="install-card-button" href="#download" data-install-go>
            Install the app
          </a>
          <a className="install-card-other" href="#download">
            Other devices
          </a>
        </div>
        <div className="footer-grid">
          <div>
            <span className="land-logo">
              <BrandIcon size={28} tile={BRAND.amber} fg={BRAND.navy} />
              <Wordmark height={14} tone="onDark" />
            </span>
            <p className="footer-about">On-the-job training, verified day by day. Made for Pangasinan State University.</p>
          </div>
          <nav aria-label="Get the app">
            <h2 className="footer-h">Get the app</h2>
            <ul>
              {DOOR_ROLES.map((role) => (
                <li key={role}>
                  <a href={installPath(role)}>{DOORS[role].plural.replace(/^./, (c) => c.toUpperCase())}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help">
            <h2 className="footer-h">Help</h2>
            <ul>
              <li>
                <a href="/help">Help centre</a>
              </li>
              <li>
                <a href="#download">Installing the app</a>
              </li>
              <li>
                <a href="/forgot-password">Forgot password</a>
              </li>
            </ul>
          </nav>
          <nav aria-label="About">
            <h2 className="footer-h">About</h2>
            <ul>
              <li>
                <a href="#checks">What the system checks</a>
              </li>
              <li>
                <a href="/help#privacy">Privacy notice</a>
              </li>
              <li className="footer-psu">
                <PsuSeal size={28} onDark clearSpace={false} />
                Pangasinan State University
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {year} Pangasinan State University</span>
          <span>Version {__APP_VERSION__}</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <>
      <a className="land-skip" href="#main">
        Skip to content
      </a>
      <span id="top" />
      <TopBar />
      <main id="main">
        <Hero />
        <Portals />
        <HowItWorks />
        <GetTheApp />
        <Checks />
      </main>
      <Footer />
    </>
  );
}

