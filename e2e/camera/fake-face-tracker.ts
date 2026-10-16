/*
|--------------------------------------------------------------------------
| A STAND-IN FOR THE FACE TRACKER
|--------------------------------------------------------------------------
|
| The time-in camera downloads MediaPipe's face tracker as one script
| (assets/vision_bundle-*.js). The camera test serves this module in its
| place, so the app's own check, button, capture and upload run on the fake
| camera's test card. Nothing in the app knows about it.
|
| It reports one face in the middle of the frame, eyes open, turning its
| head to one side and then the other every few seconds, which completes
| whichever head turns the server asked for. Once the test sets
| `globalThis.__fakeFaceHold = true` the face holds still, facing the camera,
| so the "Take photo" button stays enabled.
|
*/

export const FAKE_FACE_TRACKER = `
let started = null;
const point = (x, y) => ({ x, y, z: 0 });

export const FilesetResolver = { forVisionTasks: async () => ({}) };

export const FaceLandmarker = {
  createFromOptions: async () => ({
    detectForVideo(video, time) {
      started ??= time;
      const cycle = (time - started) % 3600;
      // Where the nose sits between the two sides of the face: 0.5 is straight ahead.
      let nose = 0.5;
      if (globalThis.__fakeFaceHold !== true) {
        if (cycle >= 1200 && cycle < 1800) nose = 0.72;
        else if (cycle >= 3000) nose = 0.28;
      }
      const points = Array.from({ length: 478 }, () => point(0.5, 0.5));
      points[10] = point(0.5, 0.25); // forehead
      points[152] = point(0.5, 0.75); // chin
      points[234] = point(0.3, 0.5); // one side of the face
      points[454] = point(0.7, 0.5); // the other
      points[1] = point(0.3 + 0.4 * nose, 0.5); // nose tip
      points[61] = point(0.42, 0.64); // corners of the mouth
      points[291] = point(0.58, 0.64);
      const score = (categoryName, value) => ({ categoryName, score: value });
      return {
        faceLandmarks: [points],
        faceBlendshapes: [{ categories: [
          score("eyeBlinkLeft", 0.08), score("eyeBlinkRight", 0.08),
          score("mouthSmileLeft", 0), score("mouthSmileRight", 0), score("jawOpen", 0),
        ] }],
      };
    },
  }),
};
`;
