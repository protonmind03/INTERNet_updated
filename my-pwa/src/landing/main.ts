import "./landing.css";
import { setUpDownload } from "./download";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE'S SCRIPT (Iteration 23)
|--------------------------------------------------------------------------
|
| The page is already drawn (it is plain HTML from the build). This adds:
| the phone menu sheet, the doors' tilt toward the pointer, the day story's
| active step, the reveal fallback where CSS scroll-driven animations are
| missing, and the Download module. It never loads the signed-in app.
|
*/

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ROLES = ["student", "supervisor", "coordinator"] as const;
type Role = (typeof ROLES)[number];

document.documentElement.classList.add("land-js");

/** Opened from the Home Screen (the original install, whose start is "/"): straight to the app. */
function openInstalledApp(): boolean {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return false;
  let role: Role = "student";
  try {
    const active = localStorage.getItem("active_role") as Role | null;
    const last = localStorage.getItem("inb_last_role") as Role | null;
    if (active && ROLES.includes(active)) role = active;
    else if (last && ROLES.includes(last)) role = last;
  } catch {
    /* private mode: the trainee door */
  }
  // The door sends someone already signed in to their own portal.
  window.location.replace(`/${role}/sign-in`);
  return true;
}

function setUpMenu(): void {
  const sheet = document.getElementById("land-menu") as HTMLDialogElement | null;
  if (!sheet || typeof sheet.showModal !== "function") return;
  document.querySelector("[data-menu-open]")?.addEventListener("click", () => sheet.showModal());
  sheet.querySelector("[data-menu-close]")?.addEventListener("click", () => sheet.close());
  sheet.querySelectorAll("[data-menu-link]").forEach((link) => link.addEventListener("click", () => sheet.close()));
  // A tap on the dimmed page beside the sheet closes it.
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });
  // Grown past the phone layout with the sheet open: close it.
  window.matchMedia("(min-width: 1024px)").addEventListener?.("change", (query) => {
    if (query.matches && sheet.open) sheet.close();
  });
}

/** Desktop only: a door leans toward the pointer, 4 degrees at most. */
function setUpTilt(): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const MAX = 4;
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      if (reducedMotion()) return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      card.style.setProperty("--tilt-y", `${(x * 2 * MAX).toFixed(2)}deg`);
      card.style.setProperty("--tilt-x", `${(-y * 2 * MAX).toFixed(2)}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    });
  });
}

/** The pinned phone shows the step being read. */
function setUpStory(): void {
  const pin = document.querySelector<HTMLElement>(".land-story-pin");
  const steps = document.querySelectorAll<HTMLElement>("[data-story-step]");
  if (!pin || steps.length === 0 || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) pin.dataset.active = (entry.target as HTMLElement).dataset.storyStep;
      }
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  steps.forEach((step) => observer.observe(step));
}

/** Where CSS cannot tie an animation to scrolling, sections are revealed as they come into view. */
function setUpReveal(): void {
  if (CSS.supports?.("animation-timeline: view()") || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" }
  );
  document.querySelectorAll(".land-reveal").forEach((element) => observer.observe(element));
}

/** Keeps the page for offline use: the same worker as the app, which also keeps this page. */
function registerWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

if (!openInstalledApp()) {
  setUpMenu();
  setUpTilt();
  setUpStory();
  setUpReveal();
  setUpDownload();
  registerWorker();
}
