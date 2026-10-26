import { BackToTop, Footer, Glyph, SealCoin, TopBar } from "./Chrome";
import { ICON } from "./icons";
import { DOOR_ROLES, DOORS, FOOL, HERO_ORDER, HOW_STEPS, ROLE_DEVICE } from "./content";
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

function Road() {
  return (
    <svg className="road" viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true" data-road>
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
      {/* Still lines for a page without its script; main.ts draws moving ones in data-road-moving. */}
      <g className="road-still">
        <path className="road-dash" d="M600 0 L600 420" pathLength={100} />
        <path className="road-dash road-dash--side" d="M583 0 L330 420" pathLength={100} />
        <path className="road-dash road-dash--side" d="M617 0 L870 420" pathLength={100} />
      </g>
      <g className="road-moving" data-road-moving />
    </svg>
  );
}

/*
| The city on the horizon, drawn once at build time: a far row in the haze,
| a near row with lit windows (a few of them flicker), the campus hall with
| its clock tower and flag on the left, a tall tower with a blinking light
| on the right, and a line of trees where the city meets the fields. The
| same seed draws the same city on every build.
*/

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

type Building = { x: number; w: number; h: number; windows: Array<{ x: number; y: number; on: boolean; flicker: number | null }> };

const CITY_H = 150;
const CITY_W = 1600;

function buildRow(seed: number, minH: number, maxH: number, gapAt: Array<[number, number]>, withWindows: boolean): Building[] {
  const random = seeded(seed);
  const row: Building[] = [];
  let x = -10;
  while (x < CITY_W + 10) {
    const w = 26 + Math.round(random() * 46);
    const h = minH + Math.round(random() * (maxH - minH));
    const skip = gapAt.some(([from, to]) => x + w > from && x < to);
    if (!skip) {
      const windows: Building["windows"] = [];
      if (withWindows) {
        const cols = Math.max(2, Math.floor((w - 8) / 9));
        const rows = Math.max(2, Math.floor((h - 12) / 11));
        const left = x + (w - cols * 9 + 4) / 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const roll = random();
            windows.push({ x: left + c * 9, y: CITY_H - h + 8 + r * 11, on: roll < 0.34, flicker: roll < 0.05 ? Math.round(random() * 90) / 10 : null });
          }
        }
      }
      row.push({ x, w, h, windows });
    }
    x += w + (random() < 0.3 ? 4 + Math.round(random() * 10) : 1);
  }
  return row;
}

const FAR_ROW = buildRow(7, 30, 82, [], false);
const NEAR_ROW = buildRow(23, 26, 74, [[330, 540], [1180, 1260]], true);
const TREES = Array.from({ length: 86 }, (_, i) => ({ x: i * 19 + ((i * 7) % 11), r: 7 + ((i * 13) % 7) }));

function City() {
  return (
    <svg className="city" viewBox={`0 0 ${CITY_W} ${CITY_H}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g className="city-far">
        {FAR_ROW.map((b) => (
          <rect key={b.x} x={b.x} y={CITY_H - b.h - 18} width={b.w} height={b.h + 18} />
        ))}
      </g>
      <g className="city-near">
        {NEAR_ROW.map((b) => (
          <rect key={b.x} x={b.x} y={CITY_H - b.h} width={b.w} height={b.h} rx="1.5" />
        ))}
      </g>
      <g className="city-windows">
        {NEAR_ROW.flatMap((b) =>
          b.windows.map((win, i) =>
            win.on ? (
              <rect
                key={`${b.x}-${i}`}
                className={win.flicker !== null ? "city-win city-win--flicker" : "city-win"}
                x={win.x.toFixed(1)}
                y={win.y}
                width="4"
                height="5"
                style={win.flicker !== null ? { animationDelay: `${win.flicker}s` } : undefined}
              />
            ) : null
          )
        )}
      </g>
      {/* The campus hall: columns, a pediment, the clock tower and the flag. */}
      <g className="city-hall" transform="translate(350 0)">
        <rect x="0" y="104" width="180" height="46" />
        <path d="M-6 106 L90 78 L186 106 Z" />
        <rect x="70" y="40" width="40" height="44" />
        <path d="M66 42 L90 22 L114 42 Z" />
        <line className="city-pole" x1="90" y1="22" x2="90" y2="2" />
        <path className="city-flag" d="M90 3 q8 -2 16 1 t16 1 v9 q-8 -2 -16 -1 t-16 -1 z" />
        <circle className="city-clock" cx="90" cy="60" r="9" />
        <path className="city-clock-hands" d="M90 60 V54 M90 60 L95 62" />
        {[14, 38, 62, 118, 142, 166].map((x) => (
          <rect key={x} className="city-col" x={x} y="112" width="5" height="38" />
        ))}
        {[24, 48, 128, 152].map((x) => (
          <rect key={x} className="city-win" x={x} y="118" width="7" height="10" />
        ))}
      </g>
      {/* The tall tower, with its blinking light. */}
      <g className="city-tower" transform="translate(1190 0)">
        <rect x="8" y="36" width="44" height="114" rx="2" />
        <rect x="18" y="20" width="24" height="18" />
        <line className="city-pole" x1="30" y1="20" x2="30" y2="0" />
        <circle className="city-beacon" cx="30" cy="2" r="2.6" />
        {Array.from({ length: 9 }, (_, r) =>
          [0, 1, 2].map((c) => (
            <rect key={`${r}-${c}`} className={(r * 3 + c) % 4 === 1 ? "city-win city-win--cool" : "city-win city-win--dim"} x={15 + c * 11} y={44 + r * 11} width="7" height="6" />
          ))
        )}
      </g>
      <g className="city-trees">
        {TREES.map((tree) => (
          <circle key={tree.x} cx={tree.x} cy={CITY_H + 2} r={tree.r} />
        ))}
      </g>
    </svg>
  );
}

const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 37 + (i % 3) * 11) % 100,
  y: (i * 53) % 44,
  s: i % 9 === 0 ? 2.6 : i % 4 === 0 ? 1.8 : 1.1,
  d: ((i * 7) % 40) / 10,
}));

function Hero() {
  return (
    <section className="hero" aria-labelledby="land-title" data-hero>
      <div className="hero-sky" aria-hidden="true">
        {STARS.map((star, i) => (
          <span key={i} className="hero-star" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.s, height: star.s, animationDelay: `${star.d}s` }} />
        ))}
        <span className="hero-shooting" />
        <span className="hero-moon" />
      </div>
      <span className="hero-horizon" aria-hidden="true" />
      <City />
      <span className="hero-ground" aria-hidden="true" />
      <Road />
      <div className="hero-inner">
        <div className="land-wrap hero-copy">
          <p className="hero-eyebrow">
            <span className="hero-live" aria-hidden="true" />
            For trainees, supervisors and coordinators
          </p>
          <h1 id="land-title" className="hero-title">
            One system. <em>Every role, every screen.</em>
          </h1>
          <p className="hero-sub">
            <SealCoin size={46} />
            <span>
              The on-the-job training system of <b>Pangasinan State University</b>, installable on any phone, tablet or computer.
            </span>
          </p>
          <p className="hero-cta">
            <a href="#doors" className="hero-cta-primary">
              Open your portal
              <Glyph d={ICON.arrow} size={18} stroke={2.4} />
            </a>
            <a href="#how" className="hero-cta-secondary">
              See how it works
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

        <div className="hero-stage" aria-label="The three portals on their devices" data-hero-stage>
          {HERO_ORDER.map((role, index) => {
            const pos = ["left", "center", "right"][index];
            const door = DOORS[role];
            return (
              <div key={role} className="hero-slot" data-role={role} data-pos={pos} data-device={door.heroDevice} data-hero-slot={role}>
                <div className="hero-slot-inner">
                  <span className="hero-pedestal" aria-hidden="true" />
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
              </div>
            );
          })}
        </div>

        <div className="land-wrap hero-controls">
          <p className="hero-caption" aria-live="polite" data-hero-caption>
            <span className="land-dot" data-role="student" aria-hidden="true" />
            <span>
              <b data-hero-role>Trainee</b>
              {" on a "}
              <span data-hero-device>phone</span>
            </span>
          </p>
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
            {door.cardTitle}
          </h3>
          <ul className="portal-bullets">
            {door.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
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
            <p className="land-eyebrow land-eyebrow--warm">How it works</p>
            <h2 id="how-title" className="land-h2">
              A <mark data-how-heading>{HOW_STEPS.student.heading}</mark> day
            </h2>
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
          <p className="land-eyebrow land-eyebrow--indigo">What the system checks</p>
          <h2 id="checks-title" className="land-h2">
            Go on, try to fool it.
          </h2>
          <p className="land-lede">Pick something a trainee might try, or scroll inside this box. See what INTERNet does.</p>
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
              <b>Blocked</b> can&rsquo;t be done · <b>Handled</b> or <b>Spotted</b> by the rules · <b>Allowed</b>, honestly: it works, and it&rsquo;s visible
            </p>
            <p className="checks-hint" data-fool-hint hidden>
              <Glyph d={ICON.mouse} size={18} />
              Scroll here for the next one
            </p>
          </div>
        </div>
      </div>
      <p className="checks-zone-tip" aria-hidden="true">
        Scroll inside the box to see all ten · scroll outside it to move on
      </p>
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
