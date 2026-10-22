import { ROLE_PALETTES } from "../brand/tokens";
import { DOORS, doorPath, installPath, type DoorRole } from "./content";

/*
|--------------------------------------------------------------------------
| GET THE APP (PSU redesign, 3B)
|--------------------------------------------------------------------------
|
| Which app (a role) and which device. The device is detected in the
| browser, with no server: `navigator.userAgentData` where the browser has
| it (its platform and whether it is a phone), otherwise the user agent.
| iPads that call themselves a Mac are told apart by their touch screen.
| The detected tile is chosen and badged "Detected"; it can be changed.
| Installing happens on the role's own sign-in page, which links that
| role's manifest: an Android or desktop browser offers its Install there
| (?install=1 puts the button first). The QR code, drawn here, opens the
| same page on a phone.
|
*/

export type Device = "android" | "ios" | "desktop";

export function detectDevice(): Device {
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }).userAgentData;
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (hints?.platform) {
    if (/android/i.test(hints.platform)) return "android";
    if (hints.mobile) return "android";
    return "desktop";
  }
  if (/Android/i.test(agent)) return "android";
  return "desktop";
}

/** iPhone and iPad browsers other than Safari name themselves in the user agent. */
function notSafariOnIos(): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|Line\//.test(navigator.userAgent);
}

export function setUpDownload(detected: Device): void {
  const panel = document.querySelector<HTMLElement>("[data-download]");
  if (!panel) return;
  let role: DoorRole = "student";
  let device: Device = detected;
  let qrFor = "";

  panel.querySelector<HTMLElement>(`[data-detected="${detected}"]`)?.removeAttribute("hidden");

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
    panel.querySelectorAll<HTMLElement>("[data-plural]").forEach((element) => (element.textContent = DOORS[role].plural));
    panel.querySelectorAll<HTMLElement>("[data-door-name]").forEach((element) => (element.textContent = DOORS[role].name.toLowerCase()));
    panel.querySelectorAll<HTMLAnchorElement>("[data-install-link]").forEach((link) => (link.href = installPath(role)));
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
  show();
}
