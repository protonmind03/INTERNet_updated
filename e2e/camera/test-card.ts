import fs from "node:fs";

/*
|--------------------------------------------------------------------------
| A TEST CARD FOR THE FAKE CAMERA
|--------------------------------------------------------------------------
|
| Chromium can play a file as its camera (--use-file-for-fake-video-capture).
| This writes one frame in that file's format (YUV4MPEG2, 4:2:0): a fine grey
| checkerboard everywhere, so the face area is sharp and evenly lit, and a
| solid red block near the LEFT edge, outside the face. A photo saved as the
| camera saw it keeps the block on the left; a mirrored one would have it
| on the right.
|
*/

export const CARD_WIDTH = 640;
export const CARD_HEIGHT = 480;

/** Where the red block is, as fractions of the frame. */
export const MARKER = { left: 0.04, right: 0.24, top: 0.35, bottom: 0.65 };

export function writeTestCard(path: string): void {
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  const inMarker = (x: number, y: number) =>
    x >= MARKER.left * width && x < MARKER.right * width && y >= MARKER.top * height && y < MARKER.bottom * height;

  const luma = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Red in BT.601 is Y 81, U 90, V 240.
      luma[y * width + x] = inMarker(x, y) ? 81 : ((x >> 3) + (y >> 3)) % 2 === 0 ? 70 : 190;
    }
  }
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const u = Buffer.alloc(chromaWidth * chromaHeight, 128);
  const v = Buffer.alloc(chromaWidth * chromaHeight, 128);
  for (let y = 0; y < chromaHeight; y += 1) {
    for (let x = 0; x < chromaWidth; x += 1) {
      if (inMarker(x * 2, y * 2)) {
        u[y * chromaWidth + x] = 90;
        v[y * chromaWidth + x] = 240;
      }
    }
  }

  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, u, v]);
  fs.writeFileSync(path, Buffer.concat([header, frame]));
}
