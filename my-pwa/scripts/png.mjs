// Reading, shrinking and writing PNG images in plain Node, for the scripts that make the
// app's image files (make-seal-sizes.mjs, make-startup-images.mjs, make-role-icons.mjs).
// No image library: the project has none, and these run once and their outputs are kept.
import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Reads an 8-bit, non-interlaced PNG (greyscale, RGB, palette, grey + alpha or RGBA,
 * with a tRNS chunk for a palette) into RGBA pixels.
 */
export function readPng(file) {
  const data = fs.readFileSync(file);
  let offset = 8;
  let width = 0, height = 0, colourType = 0;
  let palette = null, transparency = null;
  const compressed = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("Only 8-bit, non-interlaced PNG files are supported.");
      colourType = body[9];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") compressed.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType];
  if (!channels) throw new Error(`PNG colour type ${colourType} is not supported.`);
  if (colourType === 3 && !palette) throw new Error("A palette PNG without its palette.");
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
      if (colourType === 3) {
        const index = line[x];
        pixels[at] = palette[index * 3];
        pixels[at + 1] = palette[index * 3 + 1];
        pixels[at + 2] = palette[index * 3 + 2];
        pixels[at + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (colourType === 0 || colourType === 4) {
        pixels[at] = pixels[at + 1] = pixels[at + 2] = line[x * channels];
        pixels[at + 3] = colourType === 4 ? line[x * channels + 1] : 255;
      } else {
        pixels[at] = line[x * channels];
        pixels[at + 1] = line[x * channels + 1];
        pixels[at + 2] = line[x * channels + 2];
        pixels[at + 3] = channels === 4 ? line[x * channels + 3] : 255;
      }
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

/** Writes RGBA pixels as a PNG (RGBA, or RGB when `alpha` is false). Only the image: no metadata chunks. */
export function writePng(width, height, rgba, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = y * (width * channels + 1) + 1 + x * channels;
      raw[to] = rgba[from];
      raw[to + 1] = rgba[from + 1];
      raw[to + 2] = rgba[from + 2];
      if (alpha) raw[to + 3] = rgba[from + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Shrinks an image to `side` x `side` by averaging the pixels under each one (alpha-weighted). */
export function shrink(image, side) {
  const out = Buffer.alloc(side * side * 4);
  const scaleX = image.width / side;
  const scaleY = image.height / side;
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const x0 = Math.floor(x * scaleX), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
      const y0 = Math.floor(y * scaleY), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < image.height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < image.width; sx += 1) {
          const at = (sy * image.width + sx) * 4;
          const alpha = image.pixels[at + 3];
          r += image.pixels[at] * alpha; g += image.pixels[at + 1] * alpha; b += image.pixels[at + 2] * alpha; a += alpha; n += 1;
        }
      }
      const at = (y * side + x) * 4;
      if (a === 0) continue;
      out[at] = Math.round(r / a);
      out[at + 1] = Math.round(g / a);
      out[at + 2] = Math.round(b / a);
      out[at + 3] = Math.round(a / n);
    }
  }
  return { width: side, height: side, pixels: out };
}

/** "#RRGGBB" as [r, g, b]. */
export const rgbOf = (hex) => hex.replace("#", "").match(/../g).map((part) => parseInt(part, 16));

/** Draws `image` over `canvas` (both RGBA) with its top-left corner at (left, top). */
export function drawOver(canvas, image, left, top) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const cx = left + x, cy = top + y;
      if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) continue;
      const from = (y * image.width + x) * 4;
      const to = (cy * canvas.width + cx) * 4;
      const a = image.pixels[from + 3] / 255;
      if (a === 0) continue;
      for (let c = 0; c < 3; c += 1) canvas.pixels[to + c] = Math.round(image.pixels[from + c] * a + canvas.pixels[to + c] * (1 - a));
      canvas.pixels[to + 3] = Math.round(255 * (a + (canvas.pixels[to + 3] / 255) * (1 - a)));
    }
  }
}

/** A canvas filled with one colour. */
export function canvasOf(width, height, [r, g, b], alpha = 255) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) pixels.set([r, g, b, alpha], i * 4);
  return { width, height, pixels };
}

/** A filled circle, edges smoothed, drawn onto a canvas. */
export function drawDisc(canvas, cx, cy, radius, [r, g, b]) {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = Math.max(0, Math.min(1, radius - distance + 0.5));
      if (cover === 0) continue;
      const at = (y * canvas.width + x) * 4;
      canvas.pixels[at] = Math.round(r * cover + canvas.pixels[at] * (1 - cover));
      canvas.pixels[at + 1] = Math.round(g * cover + canvas.pixels[at + 1] * (1 - cover));
      canvas.pixels[at + 2] = Math.round(b * cover + canvas.pixels[at + 2] * (1 - cover));
      canvas.pixels[at + 3] = Math.max(canvas.pixels[at + 3], Math.round(255 * cover));
    }
  }
}
