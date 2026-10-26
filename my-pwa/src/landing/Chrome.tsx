import BrandIcon from "../brand/BrandIcon";
import PsuSeal from "../brand/PsuSeal";
import Wordmark from "../brand/Wordmark";
import { BRAND } from "../brand/geometry";
import { DOOR_ROLES, DOORS, ROLE_PAGE_PATH, doorPath, type DoorRole } from "./content";
import { ICON } from "./icons";

/*
|--------------------------------------------------------------------------
| WHAT EVERY PUBLIC PAGE SHARES
|--------------------------------------------------------------------------
|
| The landing page ("/") and the three role pages ("/for-trainees" and the
| others) have the same top bar, fixed at the top, the same slim footer
| and the same "Back to top" button. `page` says which page is drawn, so
| the top bar marks it and its links reach the landing page's sections
| from anywhere.
|
*/

export type PublicPage = "home" | DoorRole;

export function Glyph({ d, size = 20, stroke = 1.9 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}


/** The Android robot's head and the Apple logo, the platforms' own marks, drawn flat. */
export function AndroidMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.1a11.4 11.4 0 0 0-4.92 1.04L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.7 10.7 0 0 0 1 18h22a10.7 10.7 0 0 0-5.4-8.52zM7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25z" />
    </svg>
  );
}

export function AppleMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.37 12.7c-.02-2.24 1.83-3.32 1.91-3.37-1.04-1.52-2.66-1.73-3.24-1.75-1.38-.14-2.69.81-3.39.81-.7 0-1.78-.79-2.92-.77-1.5.02-2.89.87-3.66 2.21-1.56 2.71-.4 6.72 1.12 8.92.74 1.08 1.63 2.29 2.79 2.24 1.12-.04 1.54-.72 2.89-.72 1.35 0 1.73.72 2.91.7 1.2-.02 1.96-1.1 2.7-2.18.85-1.25 1.2-2.46 1.22-2.52-.03-.01-2.33-.9-2.35-3.56zM14.15 6.1c.62-.75 1.03-1.78.92-2.82-.89.04-1.97.59-2.6 1.34-.57.66-1.07 1.71-.94 2.73.99.08 2-.5 2.62-1.25z" />
    </svg>
  );
}

/** The seal as a coin: the PSU seal on one face, INTERNet's mark on the other. Turns slowly; still under reduced motion. */
export function SealCoin({ size = 56 }: { size?: number }) {
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
export function Info({ text, label }: { text: string; label: string }) {
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

function navFor(page: PublicPage) {
  return [
    { href: "/", label: "Home", current: page === "home" },
    ...DOOR_ROLES.map((role) => ({ href: ROLE_PAGE_PATH[role], label: `For ${DOORS[role].plural}`, current: page === role })),
    { href: "/help", label: "Help", current: false },
  ];
}

function SignInMenu({ id }: { id: string }) {
  return (
    <details className="land-signin">
      <summary className="land-signin-button" aria-controls={id}>
        Sign in
      </summary>
      <ul id={id} className="land-signin-list">
        {DOOR_ROLES.map((role) => (
          <li key={role} data-role={role}>
            {/* A new tab: the visitor keeps the website open while signing in. */}
            <a href={doorPath(role)} target="_blank" rel="noopener">
              <span className="land-dot" aria-hidden="true" />
              {DOORS[role].name}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The top bar: fixed at the top of every public page. */
export function TopBar({ page }: { page: PublicPage }) {
  const nav = navFor(page);
  return (
    <header className="land-top" data-top>
      <div className="land-wrap land-wrap--wide land-top-row">
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
            {nav.map((item) => (
              <li key={item.href}>
                <a className="land-navlink" href={item.href} aria-current={item.current ? "page" : undefined}>
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
          {nav.map((item) => (
            <li key={item.href}>
              <a className="land-sheet-link" href={item.href} data-menu-link aria-current={item.current ? "page" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </header>
  );
}

/** "Back to top": appears once the first section is scrolled away (main.ts). */
export function BackToTop() {
  return (
    <a href="#top" className="land-fab" data-back-to-top aria-label="Back to top" hidden>
      <Glyph d={ICON.up} size={22} stroke={2.4} />
    </a>
  );
}

/** The footer: slim, light, with the links a visitor looks for at the bottom of a page. */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="land-footer">
      <div className="land-wrap land-wrap--wide">
        <div className="footer-row">
          <div className="footer-brand">
            <a href="/" className="land-logo land-logo--ink" aria-label="INTERNet: home">
              <BrandIcon size={28} tile={BRAND.navy} fg={BRAND.amber} />
              <Wordmark height={14} tone="onLight" />
            </a>
            <p className="footer-about">On-the-job training, verified day by day.</p>
          </div>
          <nav aria-label="Portals" className="footer-links">
            <h2 className="footer-h">Portals</h2>
            <ul>
              {DOOR_ROLES.map((role) => (
                <li key={role}>
                  <a href={ROLE_PAGE_PATH[role]}>For {DOORS[role].plural}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help" className="footer-links">
            <h2 className="footer-h">Help</h2>
            <ul>
              <li>
                <a href="/help">Help centre</a>
              </li>
              <li>
                <a href="/forgot-password">Forgot password</a>
              </li>
              <li>
                <a href="/help#privacy">Privacy notice</a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Sign in" className="footer-links">
            <h2 className="footer-h">Sign in</h2>
            <ul>
              {DOOR_ROLES.map((role) => (
                <li key={role}>
                  <a href={doorPath(role)}>{DOORS[role].name}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <span className="footer-psu">
            <PsuSeal size={22} clearSpace={false} />
            © {year} Pangasinan State University · Lingayen Campus
          </span>
          <span>Version {__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
}
