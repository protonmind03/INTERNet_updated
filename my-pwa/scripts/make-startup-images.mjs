// Makes the start-up images an iPhone shows while INTERNet opens from the Home Screen.
//
// Without them iOS shows a white screen first. Each image is the app's background colour
// (the manifest's background_color) with the app icon in the middle, at the exact pixel size
// of one iPhone screen, upright. index.html names each one with the screen it is for.
//
//   node scripts/make-startup-images.mjs
//
// Run it again when the icon or the background colour changes; the images are kept in
// public/startup/. Plain Node only: the PNG is read and written here, with no image library.
//
// Iteration 19: one set per role as well, for the role apps (Iteration 23):
//
//   node scripts/make-startup-images.mjs student      (or supervisor, coordinator)
//
// writes public/startup/<role>/: the role's chrome colour (ROLE_PALETTES in
// src/brand/tokens.ts), the PSU seal in the top third (on a white disc when the chrome is
// dark) and the app icon in the middle: the splash's own end frame.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public", "manifest.json"), "utf8"));
const background = manifest.background_color.replace("#", "").match(/../g).map((hex) => parseInt(hex, 16));

// Portrait screens of the iPhones in use: points wide and high, and pixels per point.
export const SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6s Plus, 7 Plus, 8 Plus
  { width: 375, height: 667, ratio: 2 }, // SE (2nd and 3rd), 6s, 7, 8
];

/** Reads an 8-bit, non-interlaced RGBA or RGB PNG into RGBA pixels. */
function readPng(file) {
  const data = fs.readFileSync(file);
  let offset = 8;
  let width = 0, height = 0, colourType = 0;
  const compressed = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("Only 8-bit, non-interlaced PNG icons are supported.");
      colourType = body[9];
    } else if (type === "IDAT") compressed.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!channels) throw new Error("The icon must be an RGB or RGBA PNG.");
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      pixels[at] = line[x * channels];
      pixels[at + 1] = line[x * channels + 1];
      pixels[at + 2] = line[x * channels + 2];
      pixels[at + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}
/** Writes RGB pixels as a PNG. No text or metadata chunks: only the image. */
function writePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** One screen: the background, and the icon scaled smoothly into the middle. */
function render(icon, width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) rgb.set(background, i * 3);
  const side = Math.round(Math.min(width, height) * 0.36);
  const left = Math.round((width - side) / 2);
  const top = Math.round((height - side) / 2);
  const scale = icon.width / side;
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      // Average the icon's pixels under this one, so the shrunk icon stays smooth.
      const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < icon.height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < icon.width; sx += 1) {
          const at = (sy * icon.width + sx) * 4;
          const alpha = icon.pixels[at + 3];
          r += icon.pixels[at] * alpha; g += icon.pixels[at + 1] * alpha; b += icon.pixels[at + 2] * alpha; a += alpha; n += 1;
        }
      }
      if (a === 0) continue;
      const cover = a / (n * 255);
      const at = ((top + y) * width + left + x) * 3;
      rgb[at] = Math.round((r / a) * cover + background[0] * (1 - cover));
      rgb[at + 1] = Math.round((g / a) * cover + background[1] * (1 - cover));
      rgb[at + 2] = Math.round((b / a) * cover + background[2] * (1 - cover));
    }
  }
  return writePng(width, height, rgb);
}

export const fileFor = (screen) => `startup/apple-splash-${screen.width * screen.ratio}x${screen.height * screen.ratio}.png`;

/** A role's chrome colour and whether it is dark, read from ROLE_PALETTES in src/brand/tokens.ts. */
function roleChrome(role) {
  const tokens = fs.readFileSync(path.join(root, "src", "brand", "tokens.ts"), "utf8");
  const block = tokens.match(new RegExp(`\\n  ${role}: \\{([^}]+)\\}`))?.[1];
  const chrome = block?.match(/\bchrome: "(#[0-9A-Fa-f]{6})"/)?.[1];
  const darkList = tokens.match(/ROLE_CHROME_DARK = \{([^}]+)\}/)?.[1] ?? "";
  const dark = new RegExp(`${role}: true`).test(darkList);
  if (!chrome) throw new Error(`No chrome colour for ${role} in tokens.ts.`);
  return { chrome, dark };
}

/** One role's screen: its chrome, the seal in the top third, the icon in the middle. */
async function renderRole(icon, seal, role, width, height, ratio) {
  const { canvasOf, drawDisc, drawOver, rgbOf, shrink, writePng: write } = await import("./png.mjs");
  const { chrome, dark } = roleChrome(role);
  const canvas = canvasOf(width, height, rgbOf(chrome));
  const sealSide = Math.round(40 * ratio * 1.5);
  const sealTop = Math.round(height / 3 - sealSide / 2) - Math.round(height * 0.08);
  if (dark) drawDisc(canvas, width / 2, sealTop + sealSide / 2, (sealSide * 1.12) / 2, [255, 255, 255]);
  const round = shrink(seal, sealSide);
  // The white outside the seal's circle is background: only the circle is drawn.
  for (let y = 0; y < sealSide; y += 1) {
    for (let x = 0; x < sealSide; x += 1) {
      if (Math.hypot(x + 0.5 - sealSide / 2, y + 0.5 - sealSide / 2) > sealSide / 2) round.pixels[(y * sealSide + x) * 4 + 3] = 0;
    }
  }
  drawOver(canvas, round, Math.round((width - sealSide) / 2), sealTop);
  const iconSide = Math.round(Math.min(width, height) * 0.3);
  drawOver(canvas, shrink(icon, iconSide), Math.round((width - iconSide) / 2), Math.round((height - iconSide) / 2));
  return write(width, height, canvas.pixels, { alpha: false });
}

const ROLE = process.argv[2];
const RUN = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (RUN && ROLE) {
  if (!["student", "supervisor", "coordinator"].includes(ROLE)) throw new Error("The role is student, supervisor or coordinator.");
  const { readPng: read } = await import("./png.mjs");
  const icon = read(path.join(root, "public", "icon-512.png"));
  const seal = read(path.join(root, "src", "brand", "assets", "psu-seal.png"));
  fs.mkdirSync(path.join(root, "public", "startup", ROLE), { recursive: true });
  for (const screen of SCREENS) {
    const file = fileFor(screen).replace("startup/", `startup/${ROLE}/`);
    const png = await renderRole(icon, seal, ROLE, screen.width * screen.ratio, screen.height * screen.ratio, screen.ratio);
    fs.writeFileSync(path.join(root, "public", file), png);
    console.log(`${file}  ${Math.round(png.length / 1024)} kB`);
  }
} else if (RUN) {
  const icon = readPng(path.join(root, "public", "icon-512.png"));
  fs.mkdirSync(path.join(root, "public", "startup"), { recursive: true });
  for (const screen of SCREENS) {
    const out = path.join(root, "public", fileFor(screen));
    const png = render(icon, screen.width * screen.ratio, screen.height * screen.ratio);
    fs.writeFileSync(out, png);
    console.log(`${fileFor(screen)}  ${Math.round(png.length / 1024)} kB`);
  }
  // The lines index.html carries, one per screen.
  console.log("\n" + SCREENS.map((s) => `    <link rel="apple-touch-startup-image" media="(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)" href="/${fileFor(s)}" />`).join("\n"));
}
