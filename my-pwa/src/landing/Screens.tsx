import type { DoorRole } from "./content";

/*
|--------------------------------------------------------------------------
| THE PORTALS IN MINIATURE
|--------------------------------------------------------------------------
|
| Each role's first screen as the redesigned portal draws it, small enough
| to sit inside a device on the landing page. The figures are example text
| (the page is public and shows nobody's data). Each screen is fluid: a
| container query lays it out as a phone, a tablet or a laptop screen.
| Decorative: the words around the devices say what they show.
|
*/

function Punches() {
  return (
    <div className="mini-punch">
      {[
        ["In", "07:58"],
        ["Lunch", "--:--"],
        ["Back", "--:--"],
        ["Out", "--:--"],
      ].map(([label, time]) => (
        <span key={label}>
          <i>{label}</i>
          <b data-empty={time === "--:--" ? "" : undefined}>{time}</b>
        </span>
      ))}
    </div>
  );
}

function TraineeScreen() {
  return (
    <div className="mini mini--student">
      <div className="mini-head">
        <b>Today</b>
        <i>Day 52 of 61</i>
      </div>
      <div className="mini-lane" />
      <div className="mini-body">
        <div className="mini-card mini-timecard">
          <i className="mini-eyebrow">Working since 7:58 AM</i>
          <b className="mini-big">2h 14m</b>
          <span className="mini-stamp">On time</span>
          <div className="mini-tear" />
          <Punches />
          <span className="mini-btn mini-btn--gold">Lunch break</span>
        </div>
        <div className="mini-card mini-hours">
          <i className="mini-eyebrow">OJT hours</i>
          <b>412 of 486 h</b>
          <span className="mini-road">
            <span />
          </span>
        </div>
        <div className="mini-card mini-rows">
          <span>
            Time record <i>›</i>
          </span>
          <span>
            Weekly journal <i>Due Sun</i>
          </span>
        </div>
      </div>
      <div className="mini-dock">
        <span className="on">Today</span>
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SupervisorScreen() {
  return (
    <div className="mini mini--supervisor">
      <div className="mini-side">
        <b>Review</b>
        <span className="on" />
        <span />
        <span />
        <span />
      </div>
      <div className="mini-main">
        <div className="mini-head">
          <b>Review</b>
          <i>5 interns</i>
        </div>
        <div className="mini-body">
          <div className="mini-card mini-register">
            <i className="mini-eyebrow">Today&rsquo;s register · 4 of 5 in</i>
            <div>
              {[
                ["A", "7:58"],
                ["B", "8:12"],
                ["C", "8:00"],
                ["D", "8:03"],
                ["E", "—"],
              ].map(([who, time]) => (
                <span key={who} className={time === "—" ? "out" : ""}>
                  <b>{who}</b>
                  <i>{time}</i>
                </span>
              ))}
            </div>
          </div>
          <div className="mini-card mini-queue">
            <i className="mini-eyebrow">To verify · 6</i>
            <span>
              Time-in · 7:58 AM <em className="mini-btn mini-btn--role">Verify</em>
            </span>
            <span>
              Task · 2 files <em className="mini-btn mini-btn--line">Review</em>
            </span>
            <span>
              Time-in · offline <em className="mini-stamp mini-stamp--grey">Verified</em>
            </span>
          </div>
        </div>
      </div>
      <div className="mini-dock">
        <span className="on">Review</span>
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function CoordinatorScreen() {
  return (
    <div className="mini mini--coordinator">
      <div className="mini-side">
        <b>Home</b>
        <span className="on" />
        <span />
        <span />
        <span />
      </div>
      <div className="mini-main">
        <div className="mini-head">
          <b>Home</b>
          <i>Week 9 of 16</i>
        </div>
        <div className="mini-body">
          <div className="mini-card mini-route">
            <i className="mini-eyebrow">Trainees on the road</i>
            <div className="mini-line">
              <span className="behind" style={{ left: "6%" }} />
              <span style={{ left: "24%" }} />
              <span style={{ left: "40%" }} />
              <span style={{ left: "55%" }} />
              <span style={{ left: "70%" }} />
              <span className="done" style={{ left: "90%" }} />
            </div>
          </div>
          <div className="mini-card mini-needs">
            <i className="mini-eyebrow mini-eyebrow--bad">Needs you · 6</i>
            <span className="first">
              <code>APPEAL ×3</code> Decide <em className="mini-btn mini-btn--bad">Decide</em>
            </span>
            <span>
              <code>FLAG ×2</code> Flagged logs
            </span>
            <span>
              <code>CONCERN</code> A complaint
            </span>
          </div>
          <div className="mini-card mini-week">
            <i className="mini-eyebrow">This week</i>
            <span>MOA copies due</span>
            <span>Site visit</span>
          </div>
        </div>
      </div>
      <div className="mini-dock">
        <span className="on">Home</span>
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function PortalScreen({ role }: { role: DoorRole }) {
  if (role === "student") return <TraineeScreen />;
  if (role === "supervisor") return <SupervisorScreen />;
  return <CoordinatorScreen />;
}

/** A device frame around a role's screen: a phone, a tablet or a laptop. */
export function Device({ role, kind }: { role: DoorRole; kind: "phone" | "tablet" | "laptop" }) {
  return (
    <span className={`dev dev--${kind}`} data-role={role}>
      <span className="dev-screen">
        <PortalScreen role={role} />
      </span>
      {kind === "laptop" && <span className="dev-base" />}
    </span>
  );
}
