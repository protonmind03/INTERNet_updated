// Makes the smaller copies of the Pangasinan State University seal the app loads.
//
//   node scripts/make-seal-sizes.mjs
//
// From src/brand/assets/psu-seal.png (447 x 447, full colour on white) it writes
// psu-seal-96.png and psu-seal-192.png beside it. The seal is only shrunk: never
// recoloured, cropped or changed in any other way (the rules are in BrandPreview's
// Seal panel). The outputs are kept in the repository, so the build does not run this.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPng, shrink, writePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "src", "brand", "assets");
const seal = readPng(path.join(assets, "psu-seal.png"));

for (const side of [96, 192]) {
  const png = writePng(side, side, shrink(seal, side).pixels, { alpha: false });
  fs.writeFileSync(path.join(assets, `psu-seal-${side}.png`), png);
  console.log(`psu-seal-${side}.png  ${Math.round(png.length / 1024)} kB`);
}
