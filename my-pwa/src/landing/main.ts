import "./landing.css";
import { DEVICE_WORD, DOORS, HERO_ORDER, HOW_STEPS, type DeviceKind, type DoorRole } from "./content";
import { detectDevice, setUpDownload, type Device } from "./download";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE'S SCRIPT (PSU redesign)
|--------------------------------------------------------------------------
|
| The page is already drawn (plain HTML from the build). This adds: the
| hero's circle of roles (arrows, a side device, or the role chips turn it;
| the gold button moves the chosen portal to the next device), the role
| tabs of "How it works" (a new role starts again at step 1), the "Try to
| fool it" picker, "Get the app" (device detection, role, QR code), the
| footer's install card, the "i" tips and the phone menu. It never loads
| the signed-in app.
|
| Installed (display-mode standalone), the page is never shown: the app
| opens straight at its sign-in, with no way back to the website.
|
*/

const ROLES = ["student", "supervisor", "coordinator"] as const;
const DEVICES: DeviceKind[] = ["phone", "tablet", "laptop"];

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

/* ---------- The hero ---------- */

function setUpHero(): void {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const slots = new Map(HERO_ORDER.map((role) => [role, hero.querySelector<HTMLElement>(`[data-hero-slot="${role}"]`)!]));
  const device: Record<DoorRole, DeviceKind> = {
    student: DOORS.student.heroDevice,
    supervisor: DOORS.supervisor.heroDevice,
    coordinator: DOORS.coordinator.heroDevice,
  };
  let centre = HERO_ORDER.indexOf("student");
  const nextDevice = (kind: DeviceKind) => DEVICES[(DEVICES.indexOf(kind) + 1) % DEVICES.length];

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

/* ---------- How it works ---------- */

function setUpHow(): void {
  const section = document.querySelector<HTMLElement>("[data-how]");
  if (!section) return;
  const tabs = Array.from(section.querySelectorAll<HTMLButtonElement>("[data-how-tab]"));
  const heading = section.querySelector("[data-how-heading]");

  const pickStep = (panel: HTMLElement, n: number) =>
    panel.querySelectorAll<HTMLElement>("[data-how-step]").forEach((step) => {
      if (Number(step.dataset.howStep) === n) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });

  const pickRole = (role: DoorRole, focus = false) => {
    tabs.forEach((tab) => {
      const on = tab.dataset.howTab === role;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    section.querySelectorAll<HTMLElement>("[data-how-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.howPanel !== role;
      // A new role always starts again at step 1.
      if (!panel.hidden) pickStep(panel, 1);
    });
    heading?.replaceChildren(HOW_STEPS[role].heading);
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
  section.querySelectorAll<HTMLElement>("[data-how-panel]").forEach((panel) =>
    panel.querySelectorAll<HTMLElement>("[data-how-step]").forEach((step) =>
      step.addEventListener("click", () => pickStep(panel, Number(step.dataset.howStep)))
    )
  );
}

/* ---------- Try to fool it ---------- */

function setUpFool(): void {
  const section = document.querySelector<HTMLElement>("[data-fool]");
  if (!section) return;
  const items = section.querySelectorAll<HTMLElement>("[data-fool-pick]");
  items.forEach((item) =>
    item.addEventListener("click", () => {
      const index = item.dataset.foolPick;
      items.forEach((each) => each.setAttribute("aria-pressed", String(each === item)));
      section.querySelectorAll<HTMLElement>("[data-fool-answer]").forEach((answer) => (answer.hidden = answer.dataset.foolAnswer !== index));
    })
  );
}

/* ---------- The footer's install card ---------- */

const CARD_WORDS: Record<Device, { title: string; art: string }> = {
  android: { title: "You're on Android. Install INTERNet in two taps.", art: "android" },
  ios: { title: "You're on an iPhone or iPad. Add INTERNet to your Home Screen.", art: "ios" },
  desktop: { title: "You're on a computer. Install INTERNet in your browser.", art: "desktop" },
};

function setUpInstallCard(device: Device): void {
  const card = document.querySelector<HTMLElement>("[data-install-card]");
  if (!card) return;
  card.querySelector("[data-install-title]")?.replaceChildren(CARD_WORDS[device].title);
  const art = card.querySelector<HTMLElement>("[data-install-art]");
  const source = document.querySelector<HTMLElement>(`[data-device-tile="${device}"] .get-device-art`);
  if (art && source) art.innerHTML = source.innerHTML;
  card.querySelector("[data-install-go]")?.addEventListener("click", () => {
    const input = document.querySelector<HTMLInputElement>(`input[name="download-device"][value="${device}"]`);
    if (input && !input.checked) input.click();
  });
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

/** Keeps the page for offline use: the same worker as the app, which also keeps this page. */
function registerWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

if (!openInstalledApp()) {
  const device = detectDevice();
  setUpMenu();
  setUpHero();
  setUpHow();
  setUpFool();
  setUpDownload(device);
  setUpInstallCard(device);
  setUpInfo();
  registerWorker();
}
