import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/*
|--------------------------------------------------------------------------
| SPOTLIGHT: WHAT A NOTIFICATION OPENED THE PAGE FOR
|--------------------------------------------------------------------------
|
| Iteration 21. A notification opens a page with ?spot=<key>
| (lib/notificationTargets.ts). Once the element marked data-focus="<key>"
| is on the page (waited for up to 4 s), it is scrolled to the centre, the
| rest of the page is dimmed to 40% by an overlay with a cut-out around it,
| it eases to 103% and its outline pulses in --role-accent three times over
| about 2.4 s; then a static 3 px outline stays until the person does
| something or 4 s pass. Under reduced motion: only the static outline.
| It focuses the element when it can take focus, and never presses it:
| the camera is never opened for anyone.
|
| The styles are .inb-spotlight* in brand.css.
|
*/

const WAIT_MS = 4000;
const HOLD_MS = 4000;

/** Spotlights one element now. Returns a function that ends it. */
export function spotlight(target: HTMLElement): () => void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });

  const overlay = document.createElement("div");
  overlay.className = "inb-spotlight-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const place = () => {
    const box = target.getBoundingClientRect();
    const pad = 6;
    overlay.style.setProperty("--spot-x", `${box.left - pad}px`);
    overlay.style.setProperty("--spot-y", `${box.top - pad}px`);
    overlay.style.setProperty("--spot-w", `${box.width + pad * 2}px`);
    overlay.style.setProperty("--spot-h", `${box.height + pad * 2}px`);
  };
  place();
  if (!reduce) document.body.appendChild(overlay);
  target.classList.add(reduce ? "inb-spotlight-still" : "inb-spotlight");
  if (target.matches("button, a[href], input, select, textarea, [tabindex]")) target.focus({ preventScroll: true });

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    overlay.remove();
    target.classList.remove("inb-spotlight", "inb-spotlight-still");
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"]) window.removeEventListener(name, end, true);
    window.clearTimeout(timer);
  };
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  // The dimming lifts after the pulses; the outline stays until the person acts, or 4 s more.
  window.setTimeout(() => overlay.remove(), reduce ? 0 : 2400);
  const timer = window.setTimeout(end, (reduce ? 0 : 2400) + HOLD_MS);
  window.setTimeout(() => {
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(name, end, true);
  }, 300);
  return end;
}

/** Waits for the element marked data-focus="<key>", up to 4 s. */
export function whenOnPage(key: string, found: (element: HTMLElement) => void): () => void {
  const selector = `[data-focus="${CSS.escape(key)}"], #${CSS.escape(key.startsWith("record-") ? key : `record-${key}`)}`;
  const started = Date.now();
  let frame = 0;
  const look = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.getClientRects().length > 0) return found(element);
    if (Date.now() - started < WAIT_MS) frame = window.setTimeout(look, 120);
  };
  look();
  return () => window.clearTimeout(frame);
}

/** Mounted once per portal layout: spotlights ?spot=<key> whenever the address carries one. */
export function useSpotlightParam(): void {
  const location = useLocation();
  useEffect(() => {
    const key = new URLSearchParams(location.search).get("spot");
    if (!key || !/^[\w-]{1,80}$/.test(key)) return;
    let end: (() => void) | null = null;
    const stop = whenOnPage(key, (element) => {
      end = spotlight(element);
    });
    return () => {
      stop();
      end?.();
    };
  }, [location.key, location.search]);
}
