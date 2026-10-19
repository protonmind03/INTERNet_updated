import { ROLE_PALETTES } from "../brand/tokens";
import { DOORS, doorPath, type DoorRole } from "./content";

/*
|--------------------------------------------------------------------------
| GET THE APP (Iteration 23)
|--------------------------------------------------------------------------
|
| Which app (a role) and which device. The device is guessed from the
| browser (client hints where the browser has them, otherwise its user
| agent) and can be changed. Installing happens on the role's own door,
| which links that role's manifest: an Android or desktop browser offers
| its Install there (?install=1 puts the button first). The QR code, drawn
| here in the browser, opens the same door on a phone.
|
*/

type Device = "android" | "ios" | "desktop";

function guessDevice(): Device {
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }).userAgentData;
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (hints?.platform === "Android" || /Android/i.test(agent)) return "android";
  if (hints?.mobile) return "android";
  return "desktop";
}

/** iPhone and iPad browsers other than Safari name themselves in the user agent. */
function notSafariOnIos(): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|Line\//.test(navigator.userAgent);
}

export function setUpDownload(): void {
  const panel = document.querySelector<HTMLElement>("[data-download]");
  if (!panel) return;
  let role: DoorRole = "student";
  let device: Device = guessDevice();
  let qrFor = "";

  const drawQr = async () => {
    const box = panel.querySelector<HTMLElement>("[data-qr]");
    if (!box || device !== "desktop") return;
    const url = new URL(doorPath(role), window.location.origin).href;
    if (qrFor === url) return;
    qrFor = url;
    try {
      const { default: QRCode } = await import("qrcode");
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: ROLE_PALETTES[role].ink, light: ROLE_PALETTES[role].onPrimary },
      });
      if (qrFor === url) box.innerHTML = svg;
    } catch {
      box.textContent = "";
    }
  };

  const show = () => {
    panel.dataset.role = role;
    panel.dataset.deviceActive = device;
    panel.querySelectorAll<HTMLElement>("[data-app-name]").forEach((element) => (element.textContent = DOORS[role].appName));
    panel.querySelectorAll<HTMLElement>("[data-door-name]").forEach((element) => (element.textContent = DOORS[role].name));
    panel.querySelectorAll<HTMLAnchorElement>("[data-install-link]").forEach((link) => (link.href = `${doorPath(role)}?install=1`));
    panel.querySelectorAll<HTMLAnchorElement>("[data-door-link]").forEach((link) => (link.href = doorPath(role)));
    const warning = panel.querySelector<HTMLElement>("[data-not-safari]");
    if (warning) warning.hidden = !notSafariOnIos();
    panel.querySelectorAll<HTMLInputElement>('input[name="download-role"]').forEach((input) => (input.checked = input.value === role));
    panel.querySelectorAll<HTMLInputElement>('input[name="download-device"]').forEach((input) => (input.checked = input.value === device));
    void drawQr();
  };

  panel.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "download-role") role = input.value as DoorRole;
    if (input.name === "download-device") device = input.value as Device;
    show();
  });
  // "Get the app" on a door or in the footer picks that role here.
  document.querySelectorAll<HTMLElement>("[data-download-role]").forEach((link) =>
    link.addEventListener("click", () => {
      role = link.dataset.downloadRole as DoorRole;
      show();
    })
  );
  show();
}
