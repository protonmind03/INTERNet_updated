import type { ReactNode } from "react";
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
            Weekly report <i>Due Sun</i>
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
export function Device({ role, kind, children }: { role: DoorRole; kind: "phone" | "tablet" | "laptop"; children?: ReactNode }) {
  return (
    <span className={`dev dev--${kind}`} data-role={role}>
      <span className="dev-screen">{children ?? <PortalScreen role={role} />}</span>
      {kind === "laptop" && <span className="dev-base" />}
    </span>
  );
}

/*
| "How it works": one screen per step, so the device follows the step being
| shown. Example text only, like the screens above.
*/

function Frame({ role, title, sub, menu, children }: { role: DoorRole; title: string; sub: string; menu: string; children: ReactNode }) {
  return (
    <div className={`mini mini--${role} mini--step`}>
      {role !== "student" && (
        <div className="mini-side">
          <b>{menu}</b>
          <span className="on" />
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="mini-main">
        <div className="mini-head">
          <b>{title}</b>
          <i>{sub}</i>
        </div>
        {role === "student" && <div className="mini-lane" />}
        <div className="mini-body">{children}</div>
      </div>
      {role === "student" && (
        <div className="mini-dock">
          <span className="on">{menu}</span>
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}

function PunchRow({ times }: { times: [string, string, string, string] }) {
  return (
    <div className="mini-punch">
      {["In", "Lunch", "Back", "Out"].map((label, index) => (
        <span key={label}>
          <i>{label}</i>
          <b data-empty={times[index] === "--:--" ? "" : undefined}>{times[index]}</b>
        </span>
      ))}
    </div>
  );
}

const STEP_SCREENS: Record<DoorRole, ReactNode[]> = {
  student: [
    <Frame key="1" role="student" title="Time in" sub="Camera check" menu="Today">
      <div className="mini-card mini-cam">
        <span className="mini-oval">
          <span className="mini-face" />
        </span>
        <b>Turn your head left</b>
        <i>then back to the centre</i>
        <span className="mini-dots">
          <span className="on" />
          <span />
        </span>
      </div>
    </Frame>,
    <Frame key="2" role="student" title="Today" sub="Time out" menu="Today">
      <div className="mini-card">
        <i className="mini-eyebrow">Worked 8h 06m</i>
        <PunchRow times={["07:58", "12:01", "12:58", "17:04"]} />
      </div>
      <div className="mini-card">
        <i className="mini-eyebrow">What did you do today?</i>
        <span className="mini-text">Encoded the health survey forms and checked batch 3.</span>
        <span className="mini-chips">
          <em>Encode survey</em>
          <em>Inventory</em>
        </span>
        <span className="mini-btn mini-btn--gold">Time out</span>
      </div>
    </Frame>,
    <Frame key="3" role="student" title="Tasks" sub="3 open" menu="Tasks">
      <div className="mini-card mini-rows">
        <span>
          Inventory sheet <em className="mini-pill mini-pill--info">Submitted</em>
        </span>
        <span>
          MOA copy <em className="mini-pill mini-pill--good">Approved</em>
        </span>
        <span>
          Weekly report <em className="mini-pill mini-pill--warn">Due Sun</em>
        </span>
      </div>
      <div className="mini-card">
        <i className="mini-eyebrow">This week&rsquo;s report</i>
        <span className="mini-text">Activities · Learnings · Challenges</span>
        <span className="mini-btn mini-btn--role">Submit report</span>
      </div>
    </Frame>,
    <Frame key="4" role="student" title="Progress" sub="Verified hours" menu="Today">
      <div className="mini-card mini-hours">
        <i className="mini-eyebrow">OJT hours</i>
        <b className="mini-big">412 h</b>
        <span className="mini-road">
          <span />
        </span>
        <i className="mini-note">of 486 · finishes Nov 26</i>
      </div>
      <div className="mini-card mini-rows">
        <span>
          Time record · October <i>Print</i>
        </span>
      </div>
    </Frame>,
  ],
  supervisor: [
    <Frame key="1" role="supervisor" title="Review" sub="Today · 5 interns" menu="Review">
      <div className="mini-card mini-register mini-span">
        <i className="mini-eyebrow">Today&rsquo;s register · 4 of 5 in</i>
        <div>
          {[
            ["Ana", "7:58"],
            ["Ben", "8:12"],
            ["Cara", "8:00"],
            ["Dan", "8:03"],
            ["Eli", "—"],
          ].map(([who, time]) => (
            <span key={who} className={time === "—" ? "out" : ""}>
              <b>{who}</b>
              <i>{time}</i>
            </span>
          ))}
        </div>
      </div>
      <div className="mini-card mini-rows">
        <span>
          Not in yet <i>Eli</i>
        </span>
      </div>
      <div className="mini-card mini-rows">
        <span>
          Late today <i>Ben · 12 min</i>
        </span>
      </div>
    </Frame>,
    <Frame key="2" role="supervisor" title="To verify" sub="3 time-ins" menu="Review">
      <div className="mini-card mini-queue mini-span">
        <i className="mini-eyebrow">Time-ins · today</i>
        <span>
          Ana · 7:58 AM <em className="mini-tick">✓</em>
        </span>
        <span>
          Cara · 8:00 AM <em className="mini-tick">✓</em>
        </span>
        <span>
          Dan · offline <em className="mini-btn mini-btn--line">Confirm</em>
        </span>
        <span className="mini-btn mini-btn--role mini-wide">Verify all 2</span>
      </div>
    </Frame>,
    <Frame key="3" role="supervisor" title="Work" sub="To review" menu="Work">
      <div className="mini-card mini-queue">
        <i className="mini-eyebrow">Task · Inventory sheet</i>
        <span className="mini-text">2 files · handed in Friday</span>
        <span className="mini-pair">
          <em className="mini-btn mini-btn--line">Return</em>
          <em className="mini-btn mini-btn--role">Review</em>
        </span>
      </div>
      <div className="mini-card mini-rows">
        <span>
          Weekly report <i>Week 7</i>
        </span>
        <span>
          Medical certificate <i>PDF</i>
        </span>
      </div>
    </Frame>,
    <Frame key="4" role="supervisor" title="Evaluate" sub="Final evaluation" menu="Evaluate">
      <div className="mini-card mini-rate">
        <i className="mini-eyebrow">Ana · final evaluation</i>
        {["Quality of work", "Punctuality", "Teamwork"].map((what, index) => (
          <span key={what}>
            {what} <em>{"★★★★★".slice(0, 5 - (index === 1 ? 1 : 0))}</em>
          </span>
        ))}
      </div>
      <div className="mini-card mini-rows">
        <span>
          October time record <em className="mini-btn mini-btn--role">Certify</em>
        </span>
      </div>
    </Frame>,
  ],
  coordinator: [
    <Frame key="1" role="coordinator" title="Home" sub="Week 9 of 16" menu="Home">
      <div className="mini-card mini-needs mini-span">
        <i className="mini-eyebrow mini-eyebrow--bad">Needs you · 6</i>
        <span className="first">
          <code>APPEAL ×3</code> Decide <em className="mini-btn mini-btn--bad">Decide</em>
        </span>
        <span>
          <code>CONCERN ×2</code> Concerns to review
        </span>
        <span>
          <code>FLAG ×1</code> Flagged log
        </span>
      </div>
      <div className="mini-card mini-route mini-span">
        <i className="mini-eyebrow">Trainees on the road</i>
        <div className="mini-line">
          <span className="behind" style={{ left: "8%" }} />
          <span style={{ left: "34%" }} />
          <span style={{ left: "52%" }} />
          <span className="done" style={{ left: "88%" }} />
        </div>
      </div>
    </Frame>,
    <Frame key="2" role="coordinator" title="Appeal" sub="Photo rejection" menu="Decide">
      <div className="mini-card mini-timeline">
        <i className="mini-eyebrow">The day&rsquo;s timeline</i>
        <span>8:55 · Timed in</span>
        <span>9:20 · Photo rejected</span>
        <span>7:10 PM · Appealed</span>
      </div>
      <div className="mini-card">
        <i className="mini-eyebrow">Decision</i>
        <span className="mini-text">The face is visible in the photo.</span>
        <span className="mini-pair">
          <em className="mini-btn mini-btn--line">Uphold</em>
          <em className="mini-btn mini-btn--role">Overturn</em>
        </span>
      </div>
    </Frame>,
    <Frame key="3" role="coordinator" title="Set up the term" sub="1st semester" menu="Setup">
      <div className="mini-card mini-rows">
        <span>
          Programs and blocks <i>15 · 35</i>
        </span>
        <span>
          Schedules <i>Set</i>
        </span>
        <span>
          Holidays <i>6</i>
        </span>
      </div>
      <div className="mini-card mini-cal">
        <i className="mini-eyebrow">November</i>
        <span>
          {Array.from({ length: 21 }, (_, day) => (
            <em key={day} className={day === 1 || day === 15 ? "on" : ""} />
          ))}
        </span>
      </div>
    </Frame>,
    <Frame key="4" role="coordinator" title="Analytics" sub="All programs" menu="Reports">
      <div className="mini-card mini-bars mini-span">
        <i className="mini-eyebrow">Attendance on scheduled days</i>
        <span>
          {[72, 88, 64, 95, 81, 90].map((value, index) => (
            <em key={index} style={{ height: `${value}%` }} />
          ))}
        </span>
      </div>
      <div className="mini-card mini-rows mini-span">
        <span>
          Report for the dean <em className="mini-btn mini-btn--role">PDF report</em>
        </span>
      </div>
    </Frame>,
  ],
};

/** The screen for step `step` (1 to 4) of a role's day. */
export function StepScreen({ role, step }: { role: DoorRole; step: number }) {
  return <>{STEP_SCREENS[role][step - 1]}</>;
}
