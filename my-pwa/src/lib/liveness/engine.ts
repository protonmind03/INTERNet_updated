/*
|--------------------------------------------------------------------------
| CAMERA CHECK: THE RULES
|--------------------------------------------------------------------------
|
| Decides, frame by frame, whether a live person is in front of the camera.
| It knows nothing about the camera or the screen: it is fed one small
| reading per video frame and answers with what to show next. Keeping it
| free of the browser means the rules can be tested on their own.
|
| The check runs in this order:
|
|   position  one face, close enough, lit well enough, held for a moment
|   flash     the screen lights the face in colours (run by the camera view)
|   prompt    the prompts the server picked: blink, smile, turn the head
|   capture   face forward, eyes open, holding still; then the photo is taken
|
| It is tuned to be quick for a real person (about six seconds) and to give
| a few tries before sending the student to their supervisor.
|
*/

export type Prompt = "blink" | "smile" | "turn-left" | "turn-right";

export type FlashResult = "passed" | "inconclusive" | "skipped";

/** What the camera saw in one video frame. */
export type FaceSample = {
  /** Milliseconds, from any steady clock. */
  time: number;
  /** How many faces are in the frame. The fields below describe the first. */
  faces: number;
  /** Centre of the face, 0 to 1 across and down the frame. */
  centerX: number;
  centerY: number;
  /** Face height as a fraction of the frame height. */
  size: number;
  /** Where the nose sits between the two sides of the face: 0.5 is straight
   *  ahead, higher means the person turned to their left. */
  turn: number;
  /** 0 (open) to 1 (closed), for the more open and the more closed eye. */
  eyeMostOpen: number;
  eyeMostClosed: number;
  /** 0 to 1. */
  smile: number;
  mouthOpen: number;
  /** Distance between the corners of the mouth, as a fraction of the face's width. */
  mouthWidth: number;
  /** Average brightness of the face, 0 to 255. */
  brightness: number;
  /** How fast the face is moving, in face-widths per second. */
  speed: number;
};

export type Phase = "position" | "flash" | "prompt" | "capture" | "passed" | "failed";

/** Why the check is waiting, in the order they are worth telling the person. */
export type Hint =
  | "none"
  | "no-face"
  | "many-faces"
  | "too-far"
  | "too-close"
  | "off-centre"
  | "too-dark"
  | "too-bright"
  | "hold-still"
  | "face-forward"
  | "eyes-open"
  | "close-mouth"
  | "try-again";

export type EngineView = {
  phase: Phase;
  hint: Hint;
  /** The prompts to complete, including the spare once it is required. */
  prompts: Prompt[];
  /** How many of them are done. */
  done: number;
  /** The prompt being asked right now, during the prompt phase. */
  current: Prompt | null;
  /** True for a moment after a prompt is completed, for a tick on screen. */
  celebrating: boolean;
  /** True on frames good enough to keep as the attendance photo. */
  shoot: boolean;
  attempts: number;
};

export type EngineOptions = {
  prompts: Prompt[];
  /** Asked as well when the light check is not conclusive. */
  spare: Prompt;
  /** False when the colour flash should not run (reduced motion). */
  flash: boolean;
};

// Framing.
const MIN_SIZE = 0.26;
const MAX_SIZE = 0.82;
const MAX_OFF_CENTRE_X = 0.2;
const MAX_OFF_CENTRE_Y = 0.22;
const MIN_BRIGHTNESS = 45;
const MAX_BRIGHTNESS = 238;
const POSITION_HOLD_MS = 500;

// Prompts.
//
// Faces differ: one person's relaxed eyes read 0.05 on the tracker's
// "closed" scale and another's read 0.3, and a gentle closed-mouth smile
// barely moves its "smile" score at all. (Measured on clips of a real
// person: resting eyes 0.17 to 0.32, a blink 0.5 to 0.7, a gentle smile
// 0.08 to 0.28, a broad one 0.94.) So eyes and mouth are judged against the
// person's own resting face, not against fixed numbers.
const EYE_OPEN_MARGIN = 0.15; // this far above their resting level still counts as open
const EYE_CLOSED_MARGIN = 0.25; // this far above it, and at least EYE_CLOSED_FLOOR, is closed
const EYE_CLOSED_FLOOR = 0.4;
const EYE_SETTLE = 0.15; // how quickly the resting level follows the eyes, per frame
const EYE_DRIFT = 0.05; // and how slowly it follows eyes that droop a little
const BLINK_MAX_MS = 1500;
const SMILE_REST = 0.3; // a smile already this wide cannot start the prompt
const SMILE_ON = 0.5; // the tracker's own smile score, for a broad smile
const SMILE_WIDEN = 1.12; // or the mouth 12% wider than relaxed, for a gentle one
const SMILE_HOLD_MS = 250;
const TURN_STRAIGHT = 0.08;
const TURN_ENOUGH = 0.12;
const TURN_HOLD_MS = 150;
const PROMPT_LIMIT_MS = 9000;
const CELEBRATE_MS = 450;

// A face may drop out for a moment (a head turn, a hand); longer than this
// and the check starts over, so one person cannot stand in for another.
const FACE_LOST_MS = 1200;

// The photo.
const FORWARD = 0.09;
const STILL_SPEED = 0.45;
const CAPTURE_GOOD_MS = 500;
const CAPTURE_GOOD_FRAMES = 4;
const CAPTURE_LIMIT_MS = 10_000;

export const MAX_ATTEMPTS = 3;

export function createEngine(options: EngineOptions) {
  const prompts: Prompt[] = [...options.prompts];
  let phase: Phase = "position";
  let hint: Hint = "none";
  let attempts = 1;
  let done = 0;
  let flashResult: FlashResult | null = options.flash ? null : "skipped";
  if (!options.flash) addSpare();

  // Timers, all in sample time.
  let heldSince: number | null = null;
  let phaseSince: number | null = null;
  let lostSince: number | null = null;
  let celebrateUntil = 0;

  // Progress inside the current prompt.
  let armed = false;
  let closedAt: number | null = null;
  let actionSince: number | null = null;

  // This person's resting face, learned as the check runs.
  let eyeRest: number | null = null;
  let mouthRest = 0;

  /** Follows the eyes while they are open, and ignores them while they close. */
  function learnEyes(sample: FaceSample) {
    if (eyeRest === null) {
      eyeRest = sample.eyeMostClosed;
    } else if (sample.eyeMostClosed < eyeRest + EYE_OPEN_MARGIN) {
      eyeRest += (sample.eyeMostClosed - eyeRest) * EYE_SETTLE;
    } else if (sample.eyeMostClosed < EYE_CLOSED_FLOOR) {
      // Eyes that have relaxed a little further than before, but are plainly
      // not shut: follow them slowly, far too slowly for a blink to register.
      eyeRest += (sample.eyeMostClosed - eyeRest) * EYE_DRIFT;
    }
  }
  const eyesOpen = (sample: FaceSample) =>
    sample.eyeMostClosed <= (eyeRest ?? sample.eyeMostClosed) + EYE_OPEN_MARGIN;
  const eyesClosed = (sample: FaceSample) =>
    sample.eyeMostOpen >= Math.max(EYE_CLOSED_FLOOR, (eyeRest ?? 0) + EYE_CLOSED_MARGIN);

  // Progress toward the photo.
  let goodSince: number | null = null;
  let goodFrames = 0;

  function addSpare() {
    if (!prompts.includes(options.spare)) prompts.push(options.spare);
  }

  function resetPrompt() {
    armed = false;
    closedAt = null;
    actionSince = null;
  }

  function enter(next: Phase, time: number) {
    phase = next;
    phaseSince = time;
    heldSince = null;
    goodSince = null;
    goodFrames = 0;
    resetPrompt();
  }

  /** Starts the prompts over from the first one. */
  function restart(time: number, countsAsAttempt: boolean) {
    if (countsAsAttempt) {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        attempts = MAX_ATTEMPTS;
        enter("failed", time);
        return;
      }
    }
    done = 0;
    enter("position", time);
    hint = "try-again";
  }

  function framingProblem(sample: FaceSample): Hint {
    if (sample.faces === 0) return "no-face";
    if (sample.faces > 1) return "many-faces";
    if (sample.size < MIN_SIZE) return "too-far";
    if (sample.size > MAX_SIZE) return "too-close";
    if (
      Math.abs(sample.centerX - 0.5) > MAX_OFF_CENTRE_X ||
      Math.abs(sample.centerY - 0.5) > MAX_OFF_CENTRE_Y
    ) {
      return "off-centre";
    }
    if (sample.brightness < MIN_BRIGHTNESS) return "too-dark";
    if (sample.brightness > MAX_BRIGHTNESS) return "too-bright";
    return "none";
  }

  function promptDone(prompt: Prompt, sample: FaceSample): boolean {
    const { time } = sample;
    if (prompt === "blink") {
      // Open, then both eyes closed, then open again, as a blink does.
      if (!armed) {
        if (eyesOpen(sample)) armed = true;
        return false;
      }
      if (closedAt === null) {
        if (eyesClosed(sample)) closedAt = time;
        return false;
      }
      if (time - closedAt > BLINK_MAX_MS) {
        // Eyes held shut is not a blink; wait for them to open and go again.
        resetPrompt();
        return false;
      }
      return eyesOpen(sample);
    }

    const offset = sample.turn - 0.5;

    if (prompt === "smile") {
      // Start from a relaxed mouth, facing the camera, and remember its width.
      const facing = Math.abs(offset) < TURN_STRAIGHT;
      if (!armed) {
        if (sample.smile < SMILE_REST && facing) {
          armed = true;
          mouthRest = sample.mouthWidth;
        }
        return false;
      }
      if (sample.mouthWidth < mouthRest) mouthRest = sample.mouthWidth;
      const smiling =
        facing &&
        (sample.smile >= SMILE_ON || sample.mouthWidth >= mouthRest * SMILE_WIDEN);
      if (!smiling) {
        actionSince = null;
        return false;
      }
      actionSince ??= time;
      return time - actionSince >= SMILE_HOLD_MS;
    }

    // A head turn: start facing forward, then turn far enough the asked way.
    if (!armed) {
      if (Math.abs(offset) < TURN_STRAIGHT) armed = true;
      return false;
    }
    // A clear turn either way is accepted. What proves a live person is the
    // head turning at all; holding someone to "left, not right" would only
    // add a way to fail for people who mix the two up facing a mirrored view.
    const turned = Math.abs(offset) > TURN_ENOUGH;
    if (!turned) {
      actionSince = null;
      return false;
    }
    actionSince ??= time;
    return time - actionSince >= TURN_HOLD_MS;
  }

  function photoProblem(sample: FaceSample): Hint {
    const framing = framingProblem(sample);
    if (framing !== "none") return framing;
    if (Math.abs(sample.turn - 0.5) > FORWARD) return "face-forward";
    if (!eyesOpen(sample)) return "eyes-open";
    if (sample.mouthOpen > 0.3) return "close-mouth";
    if (sample.speed > STILL_SPEED) return "hold-still";
    return "none";
  }

  function view(time: number, shoot = false): EngineView {
    return {
      phase,
      hint,
      prompts: [...prompts],
      done,
      current: phase === "prompt" ? (prompts[done] ?? null) : null,
      celebrating: time < celebrateUntil,
      shoot,
      attempts,
    };
  }

  return {
    /** Feeds one frame's reading and returns what to show. */
    step(sample: FaceSample): EngineView {
      const { time } = sample;
      phaseSince ??= time;
      if (sample.faces === 1) learnEyes(sample);
      if (phase === "passed" || phase === "failed" || phase === "flash") return view(time);

      if (phase === "position") {
        const problem = framingProblem(sample);
        if (problem !== "none") {
          hint = problem;
          heldSince = null;
          return view(time);
        }
        heldSince ??= time;
        // Keep "let's try again" on screen until they are back in place.
        if (hint !== "try-again") hint = "none";
        if (time - heldSince >= POSITION_HOLD_MS) {
          hint = "none";
          enter(flashResult === null ? "flash" : "prompt", time);
        }
        return view(time);
      }

      // From here a face is expected to stay in view.
      if (sample.faces !== 1) {
        lostSince ??= time;
        hint = sample.faces === 0 ? "no-face" : "many-faces";
        if (time - lostSince > FACE_LOST_MS) {
          lostSince = null;
          restart(time, false);
        }
        return view(time);
      }
      lostSince = null;

      if (phase === "prompt") {
        hint = "none";
        if (time < celebrateUntil) return view(time);
        if (time - (phaseSince ?? time) > PROMPT_LIMIT_MS) {
          restart(time, true);
          return view(time);
        }
        if (promptDone(prompts[done], sample)) {
          done += 1;
          celebrateUntil = time + CELEBRATE_MS;
          enter(done >= prompts.length ? "capture" : "prompt", time + CELEBRATE_MS);
        }
        return view(time);
      }

      // Capture: wait for a run of clean frames, then the photo is taken.
      if (time < celebrateUntil) return view(time);
      if (time - (phaseSince ?? time) > CAPTURE_LIMIT_MS) {
        restart(time, true);
        return view(time);
      }
      hint = photoProblem(sample);
      if (hint !== "none") {
        goodSince = null;
        goodFrames = 0;
        return view(time);
      }
      goodSince ??= time;
      goodFrames += 1;
      if (time - goodSince >= CAPTURE_GOOD_MS && goodFrames >= CAPTURE_GOOD_FRAMES) {
        enter("passed", time);
        return view(time, true);
      }
      return view(time, true);
    },

    /** Called by the camera view when the colour flash has finished. */
    finishFlash(result: FlashResult, time: number): EngineView {
      if (phase !== "flash") return view(time);
      flashResult = result;
      // An unclear light check costs one more prompt rather than a refusal.
      if (result !== "passed") addSpare();
      enter("prompt", time);
      return view(time);
    },

    /** What the check found, for the report sent with the time-in. */
    report(): { completed: Prompt[]; flash: FlashResult; attempts: number } {
      return {
        completed: prompts.slice(0, done),
        flash: flashResult ?? "inconclusive",
        attempts,
      };
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;

/*
|--------------------------------------------------------------------------
| PICTURE MEASUREMENTS
|--------------------------------------------------------------------------
*/

/**
 * How sharp a greyscale picture is: the spread of its edges. A blurred
 * frame has soft edges and scores low. Used to keep the crispest of the
 * frames taken while the person holds still.
 */
export function sharpnessOf(grey: Uint8ClampedArray | number[], width: number, height: number): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const edge =
        4 * grey[index] - grey[index - 1] - grey[index + 1] - grey[index - width] - grey[index + width];
      sum += edge;
      sumSquares += edge * edge;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export type Rgb = { r: number; g: number; b: number };

export type FlashColour = "red" | "green" | "blue";

/**
 * Judges the colour flash. A real face a hand's length from the screen picks
 * up a little of each colour the screen shows; a picture held up to the
 * camera, or a second screen, mostly does not. Each reading is the face's
 * average colour while the screen showed that colour.
 */
export function judgeFlash(readings: Partial<Record<FlashColour, Rgb>>): FlashResult {
  const { red, green, blue } = readings;
  if (!red || !green || !blue) return "inconclusive";
  const share = (colour: Rgb, channel: keyof Rgb) => {
    const total = colour.r + colour.g + colour.b;
    return total > 0 ? colour[channel] / total : 0;
  };
  // The face should be reddest under red and greenest under green, by more
  // than camera noise. Blue reflects too weakly off skin to rely on.
  const margin = 0.004;
  const redResponds =
    share(red, "r") - Math.max(share(green, "r"), share(blue, "r")) > margin;
  const greenResponds =
    share(green, "g") - Math.max(share(red, "g"), share(blue, "g")) > margin;
  return redResponds && greenResponds ? "passed" : "inconclusive";
}
