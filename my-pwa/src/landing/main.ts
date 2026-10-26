import "./landing.css";
import { DEVICE_WORD, DOORS, HERO_ORDER, HOW_STEPS, type DeviceKind, type DoorRole } from "./content";
import { detectDevice, setUpDownload, type Device } from "./download";

/*
|--------------------------------------------------------------------------
| THE PUBLIC PAGES' SCRIPT (PSU redesign)
|--------------------------------------------------------------------------
|
| The pages are already drawn (plain HTML from the build). This adds, where
| the page has them: the top bar's shadow once scrolled and "Back to top"
| once the first section is passed; the hero's circle of roles, fitted to
| the screen, over a road that moves without end; "How it works" playing
| its steps one by one (paused by its button, a hover or a focus); "Try to
| fool it" following the scroll; the install guide of a role's page; the
| "i" tips and the phone menu. It never loads the signed-in app.
|
| Installed (display-mode standalone), the website is never shown: the app
| opens straight at its sign-in, with no way back to the website.
|
*/

const ROLES = ["student", "supervisor", "coordinator"] as const;
const DEVICES: DeviceKind[] = ["phone", "tablet", "laptop"];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.documentElement.classList.add("land-js");
document.body.classList.add("land-js");

/** Opened from the Home Screen (the original install, whose start is "/"): straight to the app. */
function openInstalledApp(): boolean {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return false;
  let role: DoorRole = "student";
  try {
    const active = localStorage.getItem("active_role") as DoorRole | null;
    const last = localStorage.getItem("inb_last_role") as DoorRole | null;
    if (active && ROLES.includes(active)) role = active;
    else if (last && ROLES.includes(last)) role = last;
  } catch {
    /* private mode: the trainee door */
  }
  window.location.replace(`/${role}/sign-in`);
  return true;
}

/** The fixed top bar's height, which sections and anchors sit under. */
const topHeight = () => document.querySelector<HTMLElement>("[data-top]")?.offsetHeight ?? 64;

function setUpMenu(): void {
  const sheet = document.getElementById("land-menu") as HTMLDialogElement | null;
  if (!sheet || typeof sheet.showModal !== "function") return;
  document.querySelector("[data-menu-open]")?.addEventListener("click", () => sheet.showModal());
  sheet.querySelector("[data-menu-close]")?.addEventListener("click", () => sheet.close());
  sheet.querySelectorAll("[data-menu-link]").forEach((link) => link.addEventListener("click", () => sheet.close()));
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });
  window.matchMedia("(min-width: 1100px)").addEventListener?.("change", (query) => {
    if (query.matches && sheet.open) sheet.close();
  });
  // The Sign in list closes on Escape and on a click elsewhere.
  document.querySelectorAll<HTMLDetailsElement>(".land-signin").forEach((menu) => {
    document.addEventListener("click", (event) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    });
  });
}

/* ---------- The top bar's shadow, and Back to top ---------- */

function setUpScrollChrome(): void {
  const top = document.querySelector<HTMLElement>("[data-top]");
  const fab = document.querySelector<HTMLAnchorElement>("[data-back-to-top]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const onScroll = () => top?.toggleAttribute("data-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (!fab) return;
  // Shown once the first section has left the screen; gone at the top and over that section.
  const show = (on: boolean) => {
    fab.hidden = false;
    fab.toggleAttribute("data-on", on);
    fab.tabIndex = on ? 0 : -1;
    fab.setAttribute("aria-hidden", String(!on));
  };
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => show(!entry.isIntersecting), { rootMargin: `-${topHeight()}px 0px 0px 0px` }).observe(hero);
  } else {
    window.addEventListener("scroll", () => show(window.scrollY > window.innerHeight), { passive: true });
  }
  // Over the footer it rises above it, so it never covers the footer's links.
  const footer = document.querySelector<HTMLElement>(".land-footer");
  const lift = () => {
    const overlap = footer ? window.innerHeight - footer.getBoundingClientRect().top : 0;
    fab.style.setProperty("--fab-lift", `${Math.max(0, Math.round(overlap))}px`);
  };
  window.addEventListener("scroll", lift, { passive: true });
  window.addEventListener("resize", lift);
  lift();
  fab.addEventListener("click", (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    document.querySelector<HTMLElement>(".land-logo")?.focus({ preventScroll: true });
  });
}

/* ---------- The hero ---------- */

function setUpHero(): void {
  const hero = document.querySelector<HTMLElement>(".hero[data-hero]");
  if (!hero) return;
  const slots = new Map(HERO_ORDER.map((role) => [role, hero.querySelector<HTMLElement>(`[data-hero-slot="${role}"]`)!]));
  const device: Record<DoorRole, DeviceKind> = {
    student: DOORS.student.heroDevice,
    supervisor: DOORS.supervisor.heroDevice,
    coordinator: DOORS.coordinator.heroDevice,
  };
  let centre = HERO_ORDER.indexOf("student");
  const nextDevice = (kind: DeviceKind) => DEVICES[(DEVICES.indexOf(kind) + 1) % DEVICES.length];

  // The devices fit the stage the screen leaves them, so the hero never needs a scroll.
  const stage = hero.querySelector<HTMLElement>("[data-hero-stage]");
  const fit = () => {
    if (!stage) return;
    const scale = Math.max(0.42, Math.min(1, (stage.clientHeight - 8) / 440));
    hero.style.setProperty("--hero-scale", scale.toFixed(3));
  };
  // The featured device starts just under the PSU sign on the skyline, so the campus's name is never behind it.
  const sign = hero.querySelector<SVGTextElement>("[data-psu-sign]");
  const place = () => {
    if (!stage) return;
    stage.style.marginTop = "";
    if (sign) {
      const gap = sign.getBoundingClientRect().bottom + 10 - stage.getBoundingClientRect().top;
      if (gap > 0) stage.style.marginTop = `${parseFloat(getComputedStyle(stage).marginTop) + gap}px`;
    }
    fit();
  };
  window.addEventListener("resize", place);
  void document.fonts?.ready.then(place);
  place();

  const draw = () => {
    const role = HERO_ORDER[centre];
    HERO_ORDER.forEach((each, index) => {
      const slot = slots.get(each)!;
      const offset = (index - centre + 3) % 3;
      const pos = offset === 0 ? "center" : offset === 1 ? "right" : "left";
      slot.dataset.pos = pos;
      slot.dataset.device = device[each];
      const frame = slot.querySelector<HTMLElement>(".dev");
      if (frame) frame.className = `dev dev--${device[each]}`;
      const base = frame?.querySelector(".dev-base");
      if (frame && device[each] === "laptop" && !base) frame.insertAdjacentHTML("beforeend", '<span class="dev-base"></span>');
      if (base && device[each] !== "laptop") base.remove();
      const turn = slot.querySelector<HTMLButtonElement>("[data-hero-turn]");
      if (turn) turn.tabIndex = pos === "center" ? -1 : 0;
      slot.querySelectorAll(".hero-note").forEach((note) => note.setAttribute("aria-hidden", pos === "center" ? "false" : "true"));
    });
    const caption = hero.querySelector<HTMLElement>("[data-hero-caption]");
    caption?.querySelector("[data-hero-role]")?.replaceChildren(DOORS[role].name);
    caption?.querySelector("[data-hero-device]")?.replaceChildren(DEVICE_WORD[device[role]]);
    caption?.querySelector(".land-dot")?.setAttribute("data-role", role);
    hero.querySelector("[data-hero-hint]")?.replaceChildren(
      `Switch device · see the ${DOORS[role].name} portal on a ${DEVICE_WORD[nextDevice(device[role])]}`
    );
    hero.querySelectorAll<HTMLElement>("[data-hero-indicator]").forEach((item) => {
      if (item.dataset.heroIndicator === role) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    hero.querySelectorAll<HTMLElement>("[data-hero-pick]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.heroPick === role)));
  };

  hero.querySelector("[data-hero-prev]")?.addEventListener("click", () => {
    centre = (centre + 2) % 3;
    draw();
  });
  hero.querySelector("[data-hero-next]")?.addEventListener("click", () => {
    centre = (centre + 1) % 3;
    draw();
  });
  hero.querySelector("[data-hero-swap]")?.addEventListener("click", () => {
    const role = HERO_ORDER[centre];
    device[role] = nextDevice(device[role]);
    draw();
  });
  hero.querySelectorAll<HTMLElement>("[data-hero-turn]").forEach((button) =>
    button.addEventListener("click", () => {
      centre = HERO_ORDER.indexOf(button.dataset.heroTurn as DoorRole);
      draw();
    })
  );
  hero.querySelectorAll<HTMLElement>("[data-hero-pick]").forEach((chip) =>
    chip.addEventListener("click", () => {
      centre = HERO_ORDER.indexOf(chip.dataset.heroPick as DoorRole);
      draw();
    })
  );
  draw();
}

/*
| The road: lane dashes and roadside posts drawn in perspective and moved
| toward the viewer. Each sits at a distance along an endless road that is
| only ever taken modulo its own length, so the motion never restarts; it
| just goes on. Stopped under reduced motion and while the hero is off
| screen.
*/
function setUpRoad(): void {
  const svg = document.querySelector<SVGSVGElement>("[data-road]");
  const layer = svg?.querySelector<SVGGElement>("[data-road-moving]");
  if (!svg || !layer) return;
  const NS = "http://www.w3.org/2000/svg";
  const H = 420;
  const NEAR = 24; // the viewer's distance to the screen's bottom edge, in road units
  const PERIOD = 40; // one dash and its gap
  const DASH = 17;
  const LENGTH = 2400; // the drawn stretch of road; beyond it everything is at the horizon
  const SPEED = 46; // road units a second
  const count = LENGTH / PERIOD;
  const lanes = [
    { top: 600, bottom: 600, width: 9 },
    { top: 583, bottom: 330, width: 5 },
    { top: 617, bottom: 870, width: 5 },
  ];
  const make = (className: string) => {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("class", className);
    layer.appendChild(line);
    return line;
  };
  const dashes = lanes.map((_, index) => Array.from({ length: count }, () => make(index === 0 ? "road-mdash" : "road-mdash road-mdash--side")));
  const POSTS = 12;
  const posts = [0, 1].map(() => Array.from({ length: POSTS }, () => make("road-mpost")));

  const yAt = (distance: number) => (H * NEAR) / (NEAR + distance);
  const xAt = (lane: { top: number; bottom: number }, y: number) => lane.top + (lane.bottom - lane.top) * (y / H);

  let travelled = 0;
  let last = 0;
  let frame = 0;
  let visible = true;

  const paint = () => {
    lanes.forEach((lane, laneIndex) => {
      dashes[laneIndex].forEach((line, k) => {
        const near = (((k * PERIOD - travelled) % LENGTH) + LENGTH) % LENGTH;
        const y1 = yAt(near);
        const y2 = yAt(near + DASH);
        line.setAttribute("x1", xAt(lane, y1).toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", xAt(lane, y2).toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        line.setAttribute("stroke-width", Math.max(0.6, (lane.width * y1) / H).toFixed(2));
      });
    });
    const postPeriod = LENGTH / POSTS / 2.5;
    posts.forEach((side, sideIndex) => {
      side.forEach((line, k) => {
        const near = (((k * postPeriod - travelled) % (postPeriod * POSTS)) + postPeriod * POSTS) % (postPeriod * POSTS);
        const y = yAt(near);
        const edge = sideIndex === 0 ? 560 - (560 * y) / H : 640 + (560 * y) / H;
        const out = sideIndex === 0 ? -1 : 1;
        const x = edge + out * (8 + (40 * y) / H);
        const height = 4 + (26 * y) / H;
        line.setAttribute("x1", x.toFixed(1));
        line.setAttribute("x2", x.toFixed(1));
        line.setAttribute("y1", y.toFixed(1));
        line.setAttribute("y2", (y - height).toFixed(1));
        line.setAttribute("stroke-width", Math.max(0.8, (7 * y) / H).toFixed(2));
      });
    });
  };

  const tick = (now: number) => {
    const seconds = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    travelled += seconds * SPEED;
    paint();
    frame = requestAnimationFrame(tick);
  };
  const run = () => {
    cancelAnimationFrame(frame);
    last = 0;
    if (!reducedMotion.matches && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  svg.classList.add("is-moving");
  paint();
  run();
  document.addEventListener("visibilitychange", run);
  reducedMotion.addEventListener?.("change", run);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      run();
    }).observe(svg);
  }
}

/* ---------- How it works: one step at a time ---------- */

const STEP_MS = 4200;

function setUpHow(): void {
  const section = document.querySelector<HTMLElement>("[data-how]");
  if (!section) return;
  const tabs = Array.from(section.querySelectorAll<HTMLButtonElement>("[data-how-tab]"));
  const heading = section.querySelector("[data-how-heading]");
  const play = section.querySelector<HTMLButtonElement>("[data-how-play]");
  let role: DoorRole = "student";
  let step = 1;
  let timer = 0;
  let wanted = !reducedMotion.matches; // the visitor's choice (the button)
  let inView = false;
  let held = false; // a hover or focus inside the steps

  section.style.setProperty("--how-ms", `${STEP_MS}ms`);
  const panel = () => section.querySelector<HTMLElement>(`[data-how-panel="${role}"]`)!;

  const showStep = (n: number) => {
    step = n;
    const current = panel();
    current.querySelectorAll<HTMLElement>("[data-how-step]").forEach((button) => {
      if (Number(button.dataset.howStep) === n) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    current.querySelectorAll<HTMLElement>("[data-how-screen]").forEach((screen) => screen.toggleAttribute("data-on", Number(screen.dataset.howScreen) === n));
    // Restart the step's progress bar.
    current.querySelectorAll<HTMLElement>(".how-progress span").forEach((bar) => {
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = "";
    });
    schedule();
  };

  const pickRole = (next: DoorRole, focus = false) => {
    role = next;
    tabs.forEach((tab) => {
      const on = tab.dataset.howTab === next;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    section.querySelectorAll<HTMLElement>("[data-how-panel]").forEach((each) => (each.hidden = each.dataset.howPanel !== next));
    heading?.replaceChildren(HOW_STEPS[next].heading);
    // A new role always starts again at step 1.
    showStep(1);
  };

  const playing = () => wanted && inView && !held && !document.hidden;
  const schedule = () => {
    window.clearTimeout(timer);
    section.toggleAttribute("data-playing", playing());
    if (!playing()) return;
    timer = window.setTimeout(() => {
      if (step < 4) showStep(step + 1);
      else pickRole(ROLES[(ROLES.indexOf(role) + 1) % ROLES.length]);
    }, STEP_MS);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => pickRole(tab.dataset.howTab as DoorRole));
    tab.addEventListener("keydown", (event) => {
      const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!move) return;
      event.preventDefault();
      pickRole(tabs[(index + move + tabs.length) % tabs.length].dataset.howTab as DoorRole, true);
    });
  });
  section.querySelectorAll<HTMLElement>("[data-how-panel]").forEach((each) =>
    each.querySelectorAll<HTMLElement>("[data-how-step]").forEach((button) =>
      button.addEventListener("click", () => {
        if (each.dataset.howPanel === role) showStep(Number(button.dataset.howStep));
      })
    )
  );
  const steps = section.querySelectorAll<HTMLElement>(".how-steps");
  steps.forEach((list) => {
    list.addEventListener("pointerenter", () => {
      held = true;
      schedule();
    });
    list.addEventListener("pointerleave", () => {
      held = false;
      schedule();
    });
    list.addEventListener("focusin", () => {
      held = true;
      schedule();
    });
    list.addEventListener("focusout", () => {
      held = false;
      schedule();
    });
  });
  if (play) {
    play.hidden = false;
    const label = () => {
      play.setAttribute("aria-pressed", String(wanted));
      play.querySelector("[data-how-play-label]")?.replaceChildren(wanted ? "Pause" : "Play");
      play.querySelector<HTMLElement>('[data-how-play-icon="pause"]')!.hidden = !wanted;
      play.querySelector<HTMLElement>('[data-how-play-icon="play"]')!.hidden = wanted;
    };
    play.addEventListener("click", () => {
      wanted = !wanted;
      label();
      schedule();
    });
    label();
  }
  document.addEventListener("visibilitychange", schedule);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        schedule();
      },
      { threshold: 0.45 }
    ).observe(section);
  }
}

/*
| Try to fool it: picked by a click, the arrow keys, or the wheel inside the
| box. On a computer the wheel over the box walks the ten items one by one;
| at the first or the last item it lets the page scroll on. The wheel
| outside the box always scrolls the page, so the section can be passed in
| one move.
*/

const WHEEL_STEP = 40; // pixels of wheel travel for one item
const WHEEL_GAP_MS = 320; // the shortest time between two items

function setUpFool(): void {
  const section = document.querySelector<HTMLElement>("[data-fool]");
  if (!section) return;
  const zone = section.querySelector<HTMLElement>(".checks-sticky");
  const items = Array.from(section.querySelectorAll<HTMLButtonElement>("[data-fool-pick]"));
  const answers = Array.from(section.querySelectorAll<HTMLElement>("[data-fool-answer]"));
  const ticks = Array.from(section.querySelectorAll<HTMLElement>("[data-fool-tick]"));
  const count = section.querySelector("[data-fool-count]");
  const hint = section.querySelector<HTMLElement>("[data-fool-hint]");
  const total = items.length;
  let current = 0;
  // A computer with room for it: the box fills the screen and answers the wheel.
  const scrolly = window.matchMedia("(min-width: 1024px) and (min-height: 600px)");

  const pick = (index: number) => {
    if (index === current) return;
    const forward = index > current;
    current = index;
    items.forEach((item, each) => item.setAttribute("aria-pressed", String(each === index)));
    answers.forEach((answer, each) => {
      answer.hidden = each !== index;
      if (each === index) answer.dataset.enter = forward ? "up" : "down";
    });
    ticks.forEach((tickMark, each) => tickMark.toggleAttribute("data-on", each <= index));
    count?.replaceChildren(String(index + 1).padStart(2, "0"));
    if (hint) hint.hidden = !scrolly.matches || index === total - 1;
  };

  items.forEach((item, index) => item.addEventListener("click", () => pick(index)));
  section.addEventListener("keydown", (event) => {
    const move = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!move || !(event.target as HTMLElement).matches("[data-fool-pick]")) return;
    event.preventDefault();
    const next = Math.min(total - 1, Math.max(0, current + move));
    items[next].click();
    items[next].focus({ preventScroll: true });
  });

  let travel = 0;
  let lastStep = 0;
  zone?.addEventListener(
    "wheel",
    (event) => {
      if (!scrolly.matches || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
      if (!delta) return;
      const direction = delta > 0 ? 1 : -1;
      const now = performance.now();
      const atEnd = direction > 0 ? current === total - 1 : current === 0;
      // Past the first or the last item the page scrolls on, once the wheel that reached it has settled.
      if (atEnd && now - lastStep > 450) {
        travel = 0;
        return;
      }
      event.preventDefault();
      // The box is brought whole onto the screen first.
      const offset = section.getBoundingClientRect().top - topHeight();
      if (Math.abs(offset) > 6) {
        window.scrollTo({ top: window.scrollY + offset, behavior: reducedMotion.matches ? "auto" : "smooth" });
        travel = 0;
        return;
      }
      if (atEnd) return;
      if (Math.sign(travel) !== direction) travel = 0;
      travel += delta;
      if (Math.abs(travel) < WHEEL_STEP || now - lastStep < WHEEL_GAP_MS) return;
      travel = 0;
      lastStep = now;
      pick(current + direction);
    },
    { passive: false }
  );

  const mode = () => {
    section.toggleAttribute("data-scrolly", scrolly.matches);
    if (hint) hint.hidden = !scrolly.matches || current === total - 1;
  };
  scrolly.addEventListener?.("change", mode);
  mode();
}

/* ---------- A role page's install card: "You're on a computer…" ---------- */

const CARD_WORDS: Record<Device, { title: string; sub: string }> = {
  android: { title: "You're on Android. Install INTERNet in two taps.", sub: "Chrome or Samsung Internet offers Install; the steps are below." },
  ios: { title: "You're on an iPhone or iPad. Add INTERNet to your Home Screen.", sub: "Open the sign-in page in Safari, then Share and Add to Home Screen." },
  desktop: { title: "You're on a computer. Install INTERNet in your browser.", sub: "Chrome or Edge offers Install in the address bar; or scan the code with your phone." },
};

function setUpInstallCard(device: Device): void {
  const card = document.querySelector<HTMLElement>("[data-install-card]");
  if (!card) return;
  card.querySelector("[data-install-title]")?.replaceChildren(CARD_WORDS[device].title);
  card.querySelector("[data-install-sub]")?.replaceChildren(CARD_WORDS[device].sub);
  const art = card.querySelector<HTMLElement>("[data-install-art]");
  const source = document.querySelector<HTMLElement>(`[data-device-tile="${device}"] .get-device-art`);
  if (art && source) art.innerHTML = source.innerHTML;
}

/* ---------- The "i" tips: 0.6 s hover, keyboard focus, a tap; closed on leave ---------- */

function setUpInfo(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-info]").forEach((button) => {
    const tip = button.nextElementSibling as HTMLElement | null;
    if (!tip) return;
    tip.id ||= `tip-${Math.random().toString(36).slice(2, 8)}`;
    let timer = 0;
    const show = () => {
      tip.hidden = false;
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-describedby", tip.id);
    };
    const hide = () => {
      window.clearTimeout(timer);
      tip.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.removeAttribute("aria-describedby");
    };
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(show, 600);
    });
    button.addEventListener("pointerleave", hide);
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible")) show();
    });
    button.addEventListener("blur", hide);
    button.addEventListener("click", () => (tip.hidden ? show() : hide()));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    });
  });
}

/** Keeps the pages for offline use: the same worker as the app, which also keeps these pages. */
function registerWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

if (!openInstalledApp()) {
  const device = detectDevice();
  setUpMenu();
  setUpScrollChrome();
  setUpHero();
  setUpRoad();
  setUpHow();
  setUpFool();
  setUpDownload(device);
  setUpInstallCard(device);
  setUpInfo();
  registerWorker();
}
