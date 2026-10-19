// Makes each role app's Home Screen icons (Iteration 23).
//
//   node scripts/make-role-icons.mjs
//
// From the app's own icons (public/icon-512.png and icon-maskable-512.png: the
// road on the brand navy tile) it writes public/icons/{role}-{192,512}.png and
// {role}-maskable-{192,512}.png, with the navy tile in the role's primary colour
// (ROLE_PALETTES in src/brand/tokens.ts). The road keeps its white and amber.
// The outputs are kept in the repository, so the build does not run this.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPng, rgbOf, shrink, writePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "icons");
fs.mkdirSync(out, { recursive: true });

// The role colours, read from tokens.ts so they are never typed twice.
const tokens = fs.readFileSync(path.join(root, "src", "brand", "tokens.ts"), "utf8");
const primaryOf = (role) => tokens.match(new RegExp(`${role}: \\{[^}]*?primary: "(#[0-9A-Fa-f]{6})"`))[1];
const NAVY = tokens.match(/navy: "(#[0-9A-Fa-f]{6})"/)?.[1] ?? "#1A237E";

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toRgb([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
}

/** The navy parts of the tile take the role's colour; white, amber and clear pixels stay. */
function tint(image, hex) {
  const [, navyS, navyL] = toHsl(rgbOf(NAVY));
  const [roleH, roleS, roleL] = toHsl(rgbOf(hex));
  const pixels = Buffer.from(image.pixels);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const [h, s, l] = toHsl([pixels[i], pixels[i + 1], pixels[i + 2]]);
    if (h < 200 || h > 260 || s < 0.2) continue;
    const lightness = l <= navyL ? (l * roleL) / navyL : roleL + ((l - navyL) * (1 - roleL)) / (1 - navyL);
    const [r, g, b] = toRgb([roleH, Math.min(1, (roleS * s) / navyS), lightness]);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
  return { ...image, pixels };
}

const sources = {
  "": readPng(path.join(root, "public", "icon-512.png")),
  "-maskable": readPng(path.join(root, "public", "icon-maskable-512.png")),
};

for (const role of ["student", "supervisor", "coordinator"]) {
  const hex = primaryOf(role);
  for (const [kind, source] of Object.entries(sources)) {
    const tinted = tint(source, hex);
    for (const side of [192, 512]) {
      const image = side === source.width ? tinted : shrink(tinted, side);
      const file = path.join(out, `${role}${kind}-${side}.png`);
      fs.writeFileSync(file, writePng(side, side, image.pixels));
      console.log(path.relative(root, file));
    }
  }
}
