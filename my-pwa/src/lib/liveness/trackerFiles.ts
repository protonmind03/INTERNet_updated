/*
|--------------------------------------------------------------------------
| THE FACE-TRACKING FILES, KEPT ON THE PHONE
|--------------------------------------------------------------------------
|
| The camera check loads MediaPipe's WebAssembly and the face model from
| this app (public/mediapipe, public/models). The service worker keeps them
| once fetched (service-worker.ts). A time-in with no connection needs them
| already there, so a student's phone fetches them at sign-in
| (precacheFaceTracker), not on first use. About 13 MB, once per version.
|
*/

// Bump these when the files under public/mediapipe or public/models change:
// MEDIAPIPE to the @mediapipe/tasks-vision version pinned in package.json,
// MODELS by one. The old cache is deleted when the new worker takes over.
export const MEDIAPIPE_CACHE = "mediapipe-0.10.14";
export const MODELS_CACHE = "models-v1";

/** The files this browser will load: MediaPipe picks the build by SIMD support. */
export function trackerFiles(simd: boolean): Array<{ cache: string; url: string }> {
  const build = simd ? "vision_wasm_internal" : "vision_wasm_nosimd_internal";
  return [
    { cache: MEDIAPIPE_CACHE, url: `/mediapipe/wasm/${build}.js` },
    { cache: MEDIAPIPE_CACHE, url: `/mediapipe/wasm/${build}.wasm` },
    { cache: MODELS_CACHE, url: "/models/face_landmarker.task" },
  ];
}

let precaching: Promise<boolean> | null = null;

/**
 * Puts the face-tracking files in the service worker's caches, unless they
 * are there already. True when all of them are kept. Safe to call often.
 */
export function precacheFaceTracker(): Promise<boolean> {
  precaching ??= (async () => {
    if (typeof caches === "undefined") return false;
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const simd = await vision.FilesetResolver.isSimdSupported();
      for (const file of trackerFiles(simd)) {
        const cache = await caches.open(file.cache);
        if (!(await cache.match(file.url))) await cache.add(file.url);
      }
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    precaching = null;
  });
  return precaching;
}

/** Whether the face-tracking files are already in the caches (either build will do). */
export async function faceTrackerKept(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const kept = async (file: { cache: string; url: string }) => Boolean(await (await caches.open(file.cache)).match(file.url));
    const either = async (simd: boolean) => (await Promise.all(trackerFiles(simd).map(kept))).every(Boolean);
    return (await either(true)) || (await either(false));
  } catch {
    return false;
  }
}
