import { clearSession, type SessionRole } from "./session";

/*
|--------------------------------------------------------------------------
| KEEP ME SIGNED IN
|--------------------------------------------------------------------------
|
| PSU redesign, Section 6. On by default (a trainee's own phone). Off, the
| sign-in lasts only while the browser (or the installed app) stays open:
| the next time it starts, the account is signed out. It is meant for a
| shared office computer.
|
| How: signing in with the box off writes END_ON_CLOSE in localStorage and
| ALIVE in sessionStorage, which a browser keeps across reloads of a tab
| but drops when it closes. At start-up (main.tsx), END_ON_CLOSE without
| ALIVE means the browser was closed since: the session is cleared. A new
| tab opened from scratch counts as a new start, so it asks again too.
| Steps recorded offline and not sent yet are kept for the next sign-in.
|
*/

const END_ON_CLOSE = "inb_end_on_close";
const ALIVE = "inb_session_alive";
const ROLES: SessionRole[] = ["student", "supervisor", "coordinator"];

/** Called by the sign-in form after a successful sign-in. */
export function rememberChoice(keep: boolean): void {
  try {
    if (keep) {
      localStorage.removeItem(END_ON_CLOSE);
    } else {
      localStorage.setItem(END_ON_CLOSE, "1");
      sessionStorage.setItem(ALIVE, "1");
    }
  } catch {
    /* private mode: storage is per session anyway */
  }
}

/** Called once at start-up, before anything reads the session. */
export async function endSessionIfNotKept(): Promise<void> {
  try {
    if (localStorage.getItem(END_ON_CLOSE) !== "1") return;
    if (sessionStorage.getItem(ALIVE) === "1") return;
    localStorage.removeItem(END_ON_CLOSE);
    const signedIn = ROLES.filter((role) => localStorage.getItem(`${role}_token`));
    await Promise.all(signedIn.map((role) => clearSession(role, { keepWaiting: true })));
    if (signedIn.length > 0) sessionStorage.setItem("session_notice", "You were signed out when the browser closed, as you asked.");
  } catch {
    /* storage unavailable: nothing was kept */
  }
}
