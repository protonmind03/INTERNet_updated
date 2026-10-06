import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { sharpnessOf, type FaceSample, type Rgb } from "./engine";

/*
|--------------------------------------------------------------------------
| CAMERA CHECK: READING THE FACE
|--------------------------------------------------------------------------
|
| Loads the face tracker and turns what it sees in a video frame into the
| small reading the rules in engine.ts work from. The tracker and its model
| are served by this app (public/mediapipe, public/models) and are only
| downloaded when a student opens the time-in camera.
|
*/

let loading: Promise<FaceLandmarker> | null = null;

/** Loads the face tracker once; later calls share the same one. */
export function loadFaceTracker(): Promise<FaceLandmarker> {
  loading ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const create = (delegate: "GPU" | "CPU") =>
      vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
        runningMode: "VIDEO",
        // Two, so a second person in the frame can be noticed.
        numFaces: 2,
        outputFaceBlendshapes: true,
      });
    try {
      return await create("GPU");
    } catch {
      // Older phones and some browsers have no usable graphics path.
      return await create("CPU");
    }
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

// Points on the tracker's face mesh.
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const SIDE_A = 234;
const SIDE_B = 454;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;

/** Where the face is in the frame, as fractions of its width and height. */
export type FaceBox = { left: number; top: number; width: number; height: number };

export type Reading = {
  sample: FaceSample;
  /** Present when exactly one face was found. */
  box: FaceBox | null;
  /** Average colour of the middle of the face, for the colour flash. */
  colour: Rgb | null;
};

/**
 * Reads frames from a video. It keeps a small copy of each frame to measure
 * brightness and colour from, and remembers the last position of the face
 * to tell how fast it is moving.
 */
export function createFaceReader(tracker: FaceLandmarker, video: HTMLVideoElement) {
  const probe = document.createElement("canvas");
  probe.width = 96;
  probe.height = 96;
  const context = probe.getContext("2d", { willReadFrequently: true });

  let last: { time: number; x: number; y: number } | null = null;

  const empty = (time: number, faces: number): Reading => ({
    sample: {
      time,
      faces,
      centerX: 0.5,
      centerY: 0.5,
      size: 0,
      turn: 0.5,
      eyeMostOpen: 0,
      eyeMostClosed: 0,
      smile: 0,
      mouthOpen: 0,
      mouthWidth: 0,
      brightness: 0,
      speed: 0,
    },
    box: null,
    colour: null,
  });

  /** Average colour inside part of the frame, read from the small copy. */
  function averageColour(box: FaceBox): Rgb | null {
    if (!context) return null;
    context.drawImage(video, 0, 0, probe.width, probe.height);
    // The middle of the face: cheeks, nose and forehead, not hair or background.
    const x = Math.max(0, Math.floor((box.left + box.width * 0.25) * probe.width));
    const y = Math.max(0, Math.floor((box.top + box.height * 0.2) * probe.height));
    const w = Math.max(1, Math.min(probe.width - x, Math.floor(box.width * 0.5 * probe.width)));
    const h = Math.max(1, Math.min(probe.height - y, Math.floor(box.height * 0.55 * probe.height)));
    const { data } = context.getImageData(x, y, w, h);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let index = 0; index < data.length; index += 4) {
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
    }
    const pixels = data.length / 4;
    return { r: r / pixels, g: g / pixels, b: b / pixels };
  }

  return {
    read(time: number): Reading {
      let result: FaceLandmarkerResult;
      try {
        result = tracker.detectForVideo(video, time);
      } catch {
        return empty(time, 0);
      }
      const faces = result.faceLandmarks.length;
      if (faces !== 1) {
        last = null;
        return empty(time, faces);
      }

      const points = result.faceLandmarks[0];
      const nose = points[NOSE_TIP];
      const sideLeft = Math.min(points[SIDE_A].x, points[SIDE_B].x);
      const sideRight = Math.max(points[SIDE_A].x, points[SIDE_B].x);
      const top = points[FOREHEAD].y;
      const bottom = points[CHIN].y;
      const width = Math.max(0.0001, sideRight - sideLeft);
      const height = Math.max(0.0001, bottom - top);
      const box: FaceBox = { left: sideLeft, top, width, height };

      const scores = new Map<string, number>();
      for (const shape of result.faceBlendshapes?.[0]?.categories ?? []) {
        scores.set(shape.categoryName, shape.score);
      }
      const eyeLeft = scores.get("eyeBlinkLeft") ?? 0;
      const eyeRight = scores.get("eyeBlinkRight") ?? 0;

      // Speed is measured against the face's own width, so it means the same
      // thing whether the person is near the camera or far from it.
      let speed = 0;
      if (last && time > last.time) {
        const moved = Math.hypot(nose.x - last.x, nose.y - last.y) / width;
        speed = moved / ((time - last.time) / 1000);
      }
      last = { time, x: nose.x, y: nose.y };

      const colour = averageColour(box);
      const brightness = colour
        ? 0.299 * colour.r + 0.587 * colour.g + 0.114 * colour.b
        : 128;

      return {
        sample: {
          time,
          faces,
          centerX: sideLeft + width / 2,
          centerY: top + height / 2,
          size: height,
          // The camera's picture is not mirrored, so the person's left is on
          // its right: a nose nearer the right edge is a turn to their left.
          turn: (nose.x - sideLeft) / width,
          eyeMostOpen: Math.min(eyeLeft, eyeRight),
          eyeMostClosed: Math.max(eyeLeft, eyeRight),
          smile: ((scores.get("mouthSmileLeft") ?? 0) + (scores.get("mouthSmileRight") ?? 0)) / 2,
          mouthOpen: scores.get("jawOpen") ?? 0,
          mouthWidth:
            Math.hypot(
              points[MOUTH_RIGHT].x - points[MOUTH_LEFT].x,
              points[MOUTH_RIGHT].y - points[MOUTH_LEFT].y
            ) / width,
          brightness,
          speed,
        },
        box,
        colour,
      };
    },
  };
}

/**
 * Takes the attendance photo from the video, at the camera's full size, and
 * scores how sharp the face is in it.
 */
export function grabFrame(
  video: HTMLVideoElement,
  box: FaceBox
): { canvas: HTMLCanvasElement; sharpness: number } | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  // Sharpness is judged on the face alone, scaled to one size so cameras of
  // different resolutions are scored alike.
  const side = 128;
  const crop = document.createElement("canvas");
  crop.width = side;
  crop.height = side;
  const cropContext = crop.getContext("2d", { willReadFrequently: true });
  if (!cropContext) return { canvas, sharpness: 0 };
  cropContext.drawImage(
    canvas,
    Math.max(0, box.left * width),
    Math.max(0, box.top * height),
    Math.min(width, box.width * width),
    Math.min(height, box.height * height),
    0,
    0,
    side,
    side
  );
  const { data } = cropContext.getImageData(0, 0, side, side);
  const grey = new Uint8ClampedArray(side * side);
  for (let index = 0; index < grey.length; index += 1) {
    grey[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
  }
  return { canvas, sharpness: sharpnessOf(grey, side, side) };
}
