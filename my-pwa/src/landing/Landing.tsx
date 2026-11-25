import { BackToTop, Footer, Glyph, SealCoin, TopBar } from "./Chrome";
import { ICON } from "./icons";
import { DOOR_ROLES, DOORS, FOOL, HERO_ORDER, HOW_STEPS, ROLE_DEVICE, ROLE_PAGE_PATH } from "./content";
import { Device, StepScreen } from "./Screens";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE (PSU redesign, Sections 1 to 5 and 9)
|--------------------------------------------------------------------------
|
| Rendered to plain HTML when the site is built (render.tsx); none of this
| runs in the browser. src/landing/main.ts adds what needs a script: the
| hero's turning circle of roles and devices and its moving road, the
| steps of "How it works" playing one by one, "Try to fool it" following
| the scroll, the "i" tips and "Back to top". Without it the page still
| reads top to bottom.
|
| Order: the hero (1D), three portals (1E), how it works (2A), what the
| system checks (4C), the footer. Installing the app is on each role's own
| page (RolePage.tsx). Each section fills one screen at 100% zoom.
|
| It imports only the brand kit and its own files: never the signed-in
| app, the camera check or the offline store.
|
*/

/* ---------- 1D: the hero ---------- */

/*
| The hero (Hallmark redesign, 2026-11-21): the three portals as one family
| of devices, a laptop at the back, a tablet beside it and a phone in
| front, set on large brass and silver arcs drawn in CSS (after the two
| device mock-ups the user supplied). The role in front is the one shown;
| main.ts moves the devices between the three places (data-pos).
*/

function Hero() {
  return (
    <section className="hero" aria-labelledby="land-title" data-hero>
      <span className="hero-swirl" aria-hidden="true">
        <i className="swirl swirl--1" />
        <i className="swirl swirl--2" />
        <i className="swirl swirl--3" />
        <i className="swirl swirl--4" />
      </span>
      <div className="land-wrap hero-inner">
        <div className="hero-copy">
          <h1 id="land-title" className="hero-title">
            One system. <em>Every role, every screen.</em>
          </h1>
          <p className="hero-sub">
            <SealCoin size={44} />
            <span>
              The on-the-job training system of <b>Pangasinan State University</b>, installable on any phone, tablet or computer.
            </span>
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

          <div className="hero-controls">
            <ul className="hero-indicator" aria-label="Roles">
              {HERO_ORDER.map((role) => (
                <li key={role} data-role={role} data-hero-indicator={role} aria-current={role === "student" ? "true" : undefined}>
                  {DOORS[role].name}
                </li>
              ))}
            </ul>
            <div className="hero-switch">
              <div className="hero-buttons">
                <button type="button" className="hero-arrow" data-hero-prev aria-label="Previous role">
                  <Glyph d={ICON.prev} />
                </button>
                <button type="button" className="hero-swap" data-hero-swap aria-describedby="hero-swap-hint">
                  <Glyph d={ICON.swap} size={22} />
                  <span className="sr-only">Switch device</span>
                </button>
                <button type="button" className="hero-arrow" data-hero-next aria-label="Next role">
                  <Glyph d={ICON.next} />
                </button>
              </div>
              <p className="hero-caption" aria-live="polite" data-hero-caption>
                <span className="land-dot" data-role="student" aria-hidden="true" />
                <span>
                  <b data-hero-role>Trainee</b>
                  {" on a "}
                  <span data-hero-device>phone</span>
                </span>
              </p>
            </div>
            <p id="hero-swap-hint" className="hero-hint" data-hero-hint>
              Switch device: see the Trainee portal on a tablet
            </p>
          </div>
        </div>

        <div className="hero-art">
          <div className="hero-stage" aria-label="The three portals on their devices" data-hero-stage>
            {HERO_ORDER.map((role, index) => {
              const pos = ["left", "center", "right"][index];
              const door = DOORS[role];
              return (
                <div key={role} className="hero-slot" data-role={role} data-pos={pos} data-device={door.heroDevice} data-hero-slot={role}>
                  <div className="hero-slot-inner">
                    <button type="button" className="hero-device" data-hero-turn={role} tabIndex={pos === "center" ? -1 : 0}>
                      <span className="sr-only">Show the {door.name} portal</span>
                      <span aria-hidden="true" className="contents">
                        <Device role={role} kind={door.heroDevice} />
                      </span>
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 1E: three portals, one road (an overview) ---------- */

function PortalCard({ role }: { role: (typeof DOOR_ROLES)[number] }) {
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
            {/* The title is the card's one link; it stretches over the whole card (landing.css). */}
            <a href={ROLE_PAGE_PATH[role]} className="portal-link">
              {door.cardTitle}
            </a>
          </h3>
          <ul className="portal-bullets">
            {door.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <span className="portal-more" aria-hidden="true">
            See the {door.cardTitle.toLowerCase()}
          </span>
        </div>
      </article>
    </li>
  );
}

function Portals() {
  return (
    <section id="doors" className="land-section land-section--paper land-fit" aria-labelledby="doors-title">
      <div className="land-wrap">
        <div className="land-head">
          <h2 id="doors-title" className="land-h2">
            Each role gets an app made for how they work
          </h2>
          <p className="land-lede">Different colours, a different first screen, and the device that suits the job.</p>
        </div>
        {/* The three portals float above one dark laptop deck, as screens lifted off the same machine. */}
        <div className="portals-stage">
          <span className="portals-deck" aria-hidden="true" />
          <ul className="portals">
            {DOOR_ROLES.map((role) => (
              <PortalCard key={role} role={role} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2A: how it works, one step at a time ---------- */

function HowItWorks() {
  return (
    <section id="how" className="land-section how land-fit" aria-labelledby="how-title" data-how>
      <div className="land-wrap how-wrap">
        <div className="how-head">
          <div>
            <h2 id="how-title" className="land-h2">
              How it works
            </h2>
            <p className="how-day">
              A <mark data-how-heading>{HOW_STEPS.student.heading}</mark> day
            </p>
          </div>
          <div className="how-controls">
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
            <button type="button" className="how-play" data-how-play aria-pressed="true" hidden>
              <span data-how-play-icon="pause">
                <Glyph d={ICON.pause} size={16} stroke={2.6} />
              </span>
              <span data-how-play-icon="play" hidden>
                <Glyph d={ICON.play} size={16} stroke={2.2} />
              </span>
              <span data-how-play-label>Pause</span>
            </button>
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
            data-device={ROLE_DEVICE[role]}
            className="how-panel"
            hidden={role !== "student"}
          >
            <div className="how-stage" aria-hidden="true">
              <span className={`dev dev--${ROLE_DEVICE[role]}`} data-role={role}>
                <span className="dev-screen">
                  {HOW_STEPS[role].steps.map((step, index) => (
                    <span key={step.title} className="how-screen" data-how-screen={index + 1} data-on={index === 0 ? "" : undefined}>
                      <StepScreen role={role} step={index + 1} />
                    </span>
                  ))}
                </span>
                {ROLE_DEVICE[role] === "laptop" && <span className="dev-base" />}
              </span>
              <span className="how-device-name">
                <Glyph d={ROLE_DEVICE[role] === "phone" ? ICON.phone : ROLE_DEVICE[role] === "tablet" ? ICON.tablet : ICON.computer} size={15} />
                {DOORS[role].name} on a {ROLE_DEVICE[role]}
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
                    <span className="how-progress" aria-hidden="true">
                      <span />
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

/* ---------- 4C: what the system checks ---------- */

function FoolScreen({ kind, title, line }: (typeof FOOL)[number]["screen"]) {
  return (
    <span className={`fool-screen fool-screen--${kind}`}>
      {kind === "camera" ? (
        <span className="fool-oval">
          <span className="fool-photo">Printed photo</span>
          <span className="fool-scan" aria-hidden="true" />
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
    <section id="checks" className="checks" aria-labelledby="checks-title" data-fool style={{ ["--fool-count" as string]: FOOL.length }}>
      <div className="checks-sticky">
        <div className="checks-list">
          <h2 id="checks-title" className="land-h2">
            What the system checks
          </h2>
          <p className="land-lede">Go on, try to fool it. Pick something a trainee might try, or scroll inside this box, and see what INTERNet does.</p>
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
          <span className="checks-texture" aria-hidden="true" />
          <div className="checks-meter" aria-hidden="true">
            <span className="checks-count">
              <b data-fool-count>01</b> / {String(FOOL.length).padStart(2, "0")}
            </span>
            <span className="checks-track">
              {FOOL.map((item, index) => (
                <span key={item.try} data-fool-tick={index} data-on={index === 0 ? "" : undefined} />
              ))}
            </span>
          </div>
          <div className="fool-answers">
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
                  <div className="fool-box fool-box--by">
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
          </div>
          <div className="checks-foot">
            <p className="fool-legend">
              <span>
                <b>Blocked</b> can&rsquo;t be done.
              </span>
              <span>
                <b>Handled</b> or <b>Spotted</b> by the rules.
              </span>
              <span>
                <b>Allowed</b>, honestly: it works, and it&rsquo;s visible.
              </span>
            </p>
            <p className="checks-hint" data-fool-hint hidden>
              <Glyph d={ICON.mouse} size={18} />
              Scroll here for the next one
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <>
      <a className="land-skip" href="#main">
        Skip to content
      </a>
      <span id="top" />
      <TopBar page="home" />
      <main id="main">
        <Hero />
        <Portals />
        <HowItWorks />
        <Checks />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
