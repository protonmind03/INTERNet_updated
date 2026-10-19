import BrandLockup from "../brand/BrandLockup";
import PsuSeal from "../brand/PsuSeal";
import { CHECKS, DAY_STEPS, DOOR_ROLES, DOORS, QUESTIONS, doorPath, type DoorRole } from "./content";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE (Iteration 23)
|--------------------------------------------------------------------------
|
| Rendered to plain HTML when the site is built (render.tsx); none of this
| runs in the browser. src/landing/main.ts adds what needs a script: the
| phone menu, the doors' tilt, the day story's active step and the
| Download module. Without it the page still reads top to bottom.
|
| It imports only the brand kit and its own files: never the signed-in
| app, the camera check or the offline store.
|
*/

function Glyph({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { href: "#door-student", label: "Trainee" },
  { href: "#door-supervisor", label: "Supervisor" },
  { href: "#door-coordinator", label: "Coordinator" },
  { href: "#download", label: "Get the app" },
  { href: "/help", label: "Help" },
];

function TopBar() {
  return (
    <header className="land-top">
      <div className="land-wrap flex min-h-16 items-center justify-between gap-4 py-2">
        <a href="/" className="land-lockup min-w-0 rounded-md" aria-label="INTERNet, Pangasinan State University · Lingayen Campus: home">
          <BrandLockup withSeal size={17} />
        </a>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a className="land-navlink" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" className="land-menu-button lg:hidden" data-menu-open aria-haspopup="dialog" aria-controls="land-menu">
          <Glyph d="M4 7h16M4 12h16M4 17h16" />
          <span>Menu</span>
        </button>
      </div>
      <dialog id="land-menu" className="land-sheet" aria-label="Menu">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--land-line)] px-5 py-3">
          <span className="font-semibold">Menu</span>
          <button type="button" className="land-menu-button" data-menu-close>
            <Glyph d="M6 6l12 12M18 6L6 18" />
            <span>Close</span>
          </button>
        </div>
        <ul className="flex flex-col p-3">
          {NAV.map((item) => (
            <li key={item.href}>
              <a className="land-sheet-link" href={item.href} data-menu-link>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </header>
  );
}

/** The trainee's day banner, as the Today page shows it, one state per step. */
function PhoneDay() {
  return (
    <div className="land-phone" data-role="student" aria-hidden="true">
      <div className="land-phone-notch" />
      <div className="land-phone-screen">
        <p className="land-phone-date">Today · Tuesday</p>
        <div className="land-banner-stack">
          {DAY_STEPS.map((step, index) => (
            <div key={step.key} className={`land-banner land-banner-${index + 1}`} data-banner={index + 1}>
              <p className="land-banner-title">{step.banner}</p>
              <p className="land-banner-note">{step.note}</p>
            </div>
          ))}
        </div>
        <ol className="land-phone-steps">
          {DAY_STEPS.map((step, index) => (
            <li key={step.key} className={`land-phone-step land-phone-step-${index + 1}`}>
              <span className="land-phone-dot" />
              {step.station}
            </li>
          ))}
        </ol>
        <div className="land-phone-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--land-muted)]">Hours</p>
          <p className="mt-1 text-[22px] font-bold leading-none text-[var(--role-ink)]">312 of 486</p>
          <span className="land-meter"><span /></span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="land-hero" aria-labelledby="land-title">
      <div className="land-wrap land-hero-grid">
        <div className="land-hero-copy">
          <p className="land-eyebrow">On-the-job training · PSU Lingayen</p>
          <h1 id="land-title" className="land-display">
            From first time‑in to final hour.
          </h1>
          <p className="land-lede">
            Attendance, tasks and records for on-the-job training at Pangasinan State University, Lingayen Campus, in one installable web app.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className="land-button land-button--primary" href="#doors">
              Choose your portal
            </a>
            <a className="land-button land-button--quiet" href="#download">
              Get the app
            </a>
          </div>
        </div>
        <div className="land-hero-visual">
          <span className="land-watermark" aria-hidden="true">
            <PsuSeal size={420} decorative clearSpace={false} />
          </span>
          <PhoneDay />
        </div>
      </div>
      <div className="land-wrap">
        <figure className="land-route" aria-label="A day's four stations: Time in, Lunch break, End break, Time out">
          <svg className="land-route-line" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={100} d="M0 40 C 120 40 160 16 280 18 S 480 44 600 40 S 840 16 1000 22" />
          </svg>
          <ol className="land-stations">
            {DAY_STEPS.map((step, index) => (
              <li key={step.key} className={`land-station land-station-${index + 1}`}>
                <span className="land-station-dot" aria-hidden="true" />
                <span className="land-station-label">{step.station}</span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}

function Door({ role }: { role: DoorRole }) {
  const door = DOORS[role];
  return (
    <li className="land-door-cell">
      <article id={`door-${role}`} data-role={role} className={`land-door land-door--${role}`} data-tilt aria-labelledby={`door-${role}-name`}>
        <p className="land-door-palette">{door.palette}</p>
        <h3 id={`door-${role}-name`} className="land-door-name">
          {door.name}
        </h3>
        <p className="land-door-promise">{door.promise}</p>
        <div className="land-door-fragment" aria-hidden="true">
          <span className="land-door-chip">{door.fragment}</span>
          <span className="land-door-note">{door.fragmentNote}</span>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <a className="land-button land-button--role" href={doorPath(role)}>
            Sign in<span className="sr-only"> as {door.name.toLowerCase()}</span>
          </a>
          <a className="land-button land-button--role-quiet" href={`#download`} data-download-role={role}>
            Get the app<span className="sr-only"> for {door.name.toLowerCase()}s</span>
          </a>
        </div>
      </article>
    </li>
  );
}

function Doors() {
  return (
    <section id="doors" className="land-section" aria-labelledby="doors-title">
      <div className="land-wrap">
        <div className="land-section-head">
          <h2 id="doors-title" className="land-h2">
            Three doors, one system.
          </h2>
          <p className="land-section-lede">Each role signs in at its own door and gets its own app, in its own colours.</p>
        </div>
        <ul className="land-doors">
          {DOOR_ROLES.map((role) => (
            <Door key={role} role={role} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function StoryScreen({ index }: { index: number }) {
  const step = DAY_STEPS[index];
  return (
    <div className="land-story-screen" data-role="student">
      <p className="land-phone-date">Today · Tuesday</p>
      <div className="land-banner land-banner--static">
        <p className="land-banner-title">{step.banner}</p>
        <p className="land-banner-note">{step.note}</p>
      </div>
      <ol className="land-phone-steps land-phone-steps--static">
        {DAY_STEPS.map((item, i) => (
          <li key={item.key} className={i <= index ? "is-done" : ""}>
            <span className="land-phone-dot" />
            {item.station}
          </li>
        ))}
      </ol>
      {index < 3 && <span className="land-story-next">{DAY_STEPS[index + 1].station}</span>}
    </div>
  );
}

function DayStory() {
  return (
    <section className="land-section land-section--warm" aria-labelledby="story-title">
      <div className="land-wrap land-story">
        <div className="land-story-steps">
          <h2 id="story-title" className="land-h2">
            How a day works
          </h2>
          <p className="land-section-lede">Four taps for the trainee. Everything else is checked behind them.</p>
          <ol className="mt-10 flex flex-col">
            {DAY_STEPS.map((step, index) => (
              <li key={step.key} className="land-story-step" data-story-step={index + 1}>
                <p className="land-story-count">0{index + 1}</p>
                <h3 className="land-h3">{step.title}</h3>
                <p className="land-body">{step.body}</p>
                <div className="land-story-inline" aria-hidden="true">
                  <div className="land-phone land-phone--small">
                    <StoryScreen index={index} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="land-story-pin" aria-hidden="true">
          <div className="land-phone" data-story-phone="1">
            <div className="land-phone-notch" />
            <div className="land-phone-screen land-phone-screen--stack">
              {DAY_STEPS.map((step, index) => (
                <div key={step.key} className="land-story-layer" data-layer={index + 1}>
                  <StoryScreen index={index} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Checks() {
  return (
    <section className="land-section" aria-labelledby="checks-title">
      <div className="land-wrap">
        <div className="land-section-head">
          <h2 id="checks-title" className="land-h2">
            What the system checks
          </h2>
          <p className="land-section-lede">Hours count when they are verified. These are the checks behind that.</p>
        </div>
        <ul className="land-checks">
          {CHECKS.map((check) => (
            <li key={check.title} className="land-check land-reveal">
              <span className="land-check-icon">
                <Glyph d={check.icon} />
              </span>
              <h3 className="land-h3">{check.title}</h3>
              <p className="land-body">{check.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const DEVICES = [
  { key: "android", label: "Android" },
  { key: "ios", label: "iPhone or iPad" },
  { key: "desktop", label: "Computer" },
] as const;

function IosStep({ n, title, d }: { n: number; title: string; d: string }) {
  return (
    <li className="land-ios-step">
      <span className="land-ios-art" aria-hidden="true">
        <Glyph d={d} size={30} />
      </span>
      <span>
        <span className="land-ios-n">Step {n}</span>
        <span className="block font-semibold">{title}</span>
      </span>
    </li>
  );
}

function Download() {
  return (
    <section id="download" className="land-section land-section--night" aria-labelledby="download-title">
      <div className="land-wrap land-download">
        <div>
          <h2 id="download-title" className="land-h2">
            Get the app
          </h2>
          <p className="land-section-lede">
            Each portal is an installable web app: it is added from the browser to your Home Screen, dock or desktop, with no app store.
          </p>
        </div>
        <div className="land-download-panel" data-download data-role="student">
          <fieldset className="land-switch">
            <legend className="land-switch-legend">Which app?</legend>
            {DOOR_ROLES.map((role, index) => (
              <label key={role} className="land-switch-option">
                <input type="radio" name="download-role" value={role} defaultChecked={index === 0} />
                <span>{DOORS[role].name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="land-switch">
            <legend className="land-switch-legend">On which device?</legend>
            {DEVICES.map((device, index) => (
              <label key={device.key} className="land-switch-option">
                <input type="radio" name="download-device" value={device.key} defaultChecked={index === 0} />
                <span>{device.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="land-device" data-device="android">
            <h3 className="land-h3">
              Install <span data-app-name>INTERNet Trainee</span> on Android
            </h3>
            <p className="land-body">Open the door in Chrome and tap Install. The app opens from its own icon after that.</p>
            <a className="land-button land-button--role mt-4" data-install-link href="/student/sign-in?install=1">
              Open the door to install
            </a>
            <p className="land-body mt-4">No Install button? In Chrome, open the menu (the three dots), then choose Install app or Add to Home screen.</p>
          </div>

          <div className="land-device" data-device="ios">
            <h3 className="land-h3">
              Add <span data-app-name>INTERNet Trainee</span> to your Home Screen
            </h3>
            <p className="land-ios-warning" data-not-safari hidden>
              These steps are for Safari. If Add to Home Screen is missing from this browser&rsquo;s Share menu, open the door in Safari.
            </p>
            <ol className="land-ios-steps">
              <IosStep n={1} title="Open the door in Safari" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z" />
              <IosStep n={2} title="Tap Share" d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9" />
              <IosStep n={3} title="Tap Add to Home Screen, then Add" d="M5 5h14v14H5zM12 9v6M9 12h6" />
            </ol>
            <a className="land-button land-button--role mt-4" data-door-link href="/student/sign-in">
              Open the door
            </a>
          </div>

          <div className="land-device" data-device="desktop">
            <h3 className="land-h3">
              Install <span data-app-name>INTERNet Trainee</span> on a computer
            </h3>
            <p className="land-body">
              Chrome or Edge: open the door and choose Install, on the page or at the right of the address bar. Safari on a Mac: open the door, then File, Add to Dock.
            </p>
            <a className="land-button land-button--role mt-4" data-install-link href="/student/sign-in?install=1">
              Open the door to install
            </a>
            <div className="land-qr">
              <div className="land-qr-code" data-qr aria-hidden="true" />
              <p className="land-body">
                Or scan this with your phone to open the <span data-door-name>Trainee</span> door there.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="land-section" aria-labelledby="questions-title">
      <div className="land-wrap land-questions">
        <h2 id="questions-title" className="land-h2">
          Questions
        </h2>
        <div className="land-details-list">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="land-details">
              <summary>{item.q}</summary>
              <p className="land-body">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="land-footer">
      <div className="land-wrap">
        <div className="land-footer-grid">
          <div>
            <BrandLockup withSeal size={18} />
            <p className="land-body mt-4 max-w-xs">A system proposal for Pangasinan State University – Lingayen Campus</p>
          </div>
          <nav aria-label="Portals">
            <h2 className="land-footer-h">Portals</h2>
            <ul>
              {DOOR_ROLES.map((role) => (
                <li key={role}>
                  <a href={doorPath(role)}>{DOORS[role].name}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Get the app">
            <h2 className="land-footer-h">Get the app</h2>
            <ul>
              {DOOR_ROLES.map((role) => (
                <li key={role}>
                  <a href="#download" data-download-role={role}>
                    {DOORS[role].appName}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help">
            <h2 className="land-footer-h">Help</h2>
            <ul>
              <li>
                <a href="/help">Help and offline use</a>
              </li>
              <li>
                <a href="/help#privacy">Privacy notice</a>
              </li>
              <li>
                <a href="/help#contact">Contact the OJT office</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="land-footer-bottom">
          <span>© 2026 INTERNet</span>
          <span>Build {__APP_VERSION__}</span>
          <span>Lingayen, Pangasinan</span>
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
      <TopBar />
      <main id="main">
        <Hero />
        <Doors />
        <DayStory />
        <Checks />
        <Download />
        <Questions />
      </main>
      <Footer />
    </>
  );
}
