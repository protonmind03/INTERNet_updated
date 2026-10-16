import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLoader } from "../brand";
import { createFaceReader, grabFrame, loadFaceTracker, type Reading } from "../lib/liveness/detector";
import {
  createEngine,
  judgeFlash,
  MAX_ATTEMPTS,
  type EngineView,
  type FlashColour,
  type FlashResult,
  type Hint,
  type Prompt,
  type Rgb,
} from "../lib/liveness/engine";
import Icon, { type IconName } from "./Icon";
import { Button } from "./ui";
import { useWakeLock } from "../lib/useWakeLock";

/*
|--------------------------------------------------------------------------
| CAMERA CHECK
|--------------------------------------------------------------------------
|
| The time-in camera. It opens the front camera and makes sure a live
| person is there: they turn their head once or twice (on the strict level
| the screen also lights their face in colours). Then a round "Take photo"
| button appears, enabled only while one face is centred, facing forward,
| eyes open and sharp, so the student can settle before the shot. The photo
| kept is the sharpest frame from just before the tap. There is no way to
| choose a file.
|
| The preview is mirrored, as people expect while posing; the photo is the
| camera's own frame, not mirrored (grabFrame).
|
| When the camera or the check cannot work on this device, it says why and
| points the student to their supervisor, who can record the time-in from
| the supervisor portal instead.
|
*/

export type LivenessReport = {
  completed: Prompt[];
  flash: FlashResult;
  attempts: number;
  sharpness: number;
  duration_ms: number;
};

type Problem = "unsupported" | "blocked" | "no-camera" | "in-use" | "tracker" | "failed" | "expired";

const PROBLEMS: Record<Problem, { title: string; detail: string }> = {
  unsupported: {
    title: "This browser can't open the camera",
    detail: "Open INTERNet in an up-to-date browser such as Chrome or Safari, over a secure (https) address.",
  },
  blocked: {
    title: "The camera is blocked",
    detail: "Allow camera access for this site in your browser's settings, then try again.",
  },
  "no-camera": {
    title: "No camera was found",
    detail: "This device has no camera the browser can use.",
  },
  "in-use": {
    title: "The camera is busy",
    detail: "Another app is using the camera. Close it, then try again.",
  },
  tracker: {
    title: "The camera check couldn't start",
    detail: "Check your connection and try again.",
  },
  failed: {
    title: "The check didn't go through",
    detail: "Find a brighter spot, hold the phone at arm's length, and try once more.",
  },
  expired: {
    title: "The camera check timed out",
    detail: "Each check lasts 10 minutes. Start a new one to time in.",
  },
};

// Frames kept while the button is enabled, so the photo is the sharpest one
// from just before the tap, not one shaken by it.
const KEEP_EVERY_MS = 250;
const KEEP_FOR_MS = 800;
// The countdown shows in the ticket's last minute.
const COUNTDOWN_FROM_S = 60;

const PROMPT_TEXT: Record<Prompt, { text: string; icon: IconName; flip?: boolean }> = {
  blink: { text: "Blink your eyes", icon: "user" },
  smile: { text: "Give a smile", icon: "user" },
  // The preview is mirrored, so "your left" is also the left of the screen.
  "turn-left": { text: "Turn your head to your left", icon: "arrow-right", flip: true },
  "turn-right": { text: "Turn your head to your right", icon: "arrow-right" },
};

const HINT_TEXT: Record<Hint, string> = {
  none: "",
  "no-face": "Bring your face into the oval",
  "many-faces": "Only one person in the frame, please",
  "too-far": "Move a little closer",
  "too-close": "Move back a little",
  "off-centre": "Centre your face in the oval",
  "too-dark": "Find a spot with more light",
  "too-bright": "Too much glare. Turn away from the light",
  "hold-still": "Hold still",
  "face-forward": "Face the camera",
  "eyes-open": "Keep your eyes open",
  "close-mouth": "Relax your mouth",
  blurry: "Hold the phone steady",
};

/** Why the check started over: the headline until it moves on again. */
const NOTICE_TEXT: Record<NonNullable<EngineView["notice"]>, string> = {
  "try-again": "That took too long. Let's go again",
  "face-lost": "We lost your face. Let's start again",
  "another-face": "Someone else came into view. Let's start again",
};

const FLASH_COLOURS: Record<FlashColour, string> = {
  red: "#ff3b3b",
  green: "#2bff6a",
  blue: "#3b6bff",
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function problemFor(error: unknown): Problem {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  if (name === "NotReadableError" || name === "AbortError") return "in-use";
  return "unsupported";
}

/** What changes on screen; frames that leave it the same do not re-render. */
function viewKey(view: EngineView): string {
  return [
    view.phase,
    view.hint,
    view.done,
    view.current,
    view.celebrating,
    view.attempts,
    view.prompts.length,
    // Whether the "Take photo" button is enabled.
    view.shoot,
    view.notice,
  ].join("|");
}

export default function LivenessCamera({
  prompts,
  spare,
  strict,
  expiresAt,
  onPassed,
  onRenew,
}: {
  /** The prompts the server picked for this time-in. */
  prompts: Prompt[];
  spare: Prompt | null;
  /** The strict level: the colour light test runs too. */
  strict: boolean;
  /** When the server's ticket runs out, on this device's clock (ms). */
  expiresAt: number;
  onPassed: (photo: File, report: LivenessReport) => void;
  /** Asks the server for a new check, when this one has run out. */
  onRenew: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const passed = useRef(onPassed);
  useEffect(() => {
    passed.current = onPassed;
  }, [onPassed]);
  // Set while the camera runs: what the "Take photo" button does.
  const takeRef = useRef<(() => void) | null>(null);
  // Set while the camera runs: stops it when the ticket runs out.
  const expireRef = useRef<(() => void) | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Raised to start the camera again after a problem.
  const [run, setRun] = useState(0);
  const [starting, setStarting] = useState(true);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [view, setView] = useState<EngineView | null>(null);
  const [flash, setFlash] = useState<FlashColour | null>(null);
  const [finished, setFinished] = useState(false);
  // The check is done by looking at the phone, not touching it: keep the
  // screen on until the photo is taken.
  useWakeLock(!finished);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameRequest = 0;

    const stopCamera = () => {
      cancelAnimationFrame(frameRequest);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const fail = (reason: Problem) => {
      stopCamera();
      if (cancelled) return;
      setFlash(null);
      setStarting(false);
      setProblem(reason);
    };

    void (async () => {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        fail("unsupported");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        fail(problemFor(error));
        return;
      }
      if (cancelled) {
        stopCamera();
        return;
      }

      let tracker;
      try {
        tracker = await loadFaceTracker();
        video.srcObject = stream;
        await video.play();
      } catch {
        fail("tracker");
        return;
      }
      if (cancelled) {
        stopCamera();
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const engine = createEngine({ prompts, spare, flash: strict && !reducedMotion });
      const reader = createFaceReader(tracker, video);
      const startedAt = performance.now();
      setStarting(false);

      let latest: Reading | null = null;
      let lastVideoTime = -1;
      let lastKey = "";
      let flashStarted = false;
      // Full frames kept while the button is enabled, newest last.
      type Kept = { time: number; frame: NonNullable<ReturnType<typeof grabFrame>> };
      let kept: Kept[] = [];

      const publish = (next: EngineView) => {
        const key = viewKey(next);
        if (key === lastKey) return;
        lastKey = key;
        setView(next);
      };

      // Lights the face in three colours and reads what comes back.
      const runFlash = async () => {
        const order: FlashColour[] = ["red", "green", "blue"];
        // Fisher-Yates: every order is equally likely, which sorting by a
        // random comparison does not give.
        for (let index = order.length - 1; index > 0; index -= 1) {
          const other = Math.floor(Math.random() * (index + 1));
          [order[index], order[other]] = [order[other], order[index]];
        }
        const readings: Partial<Record<FlashColour, Rgb>> = {};
        for (const colour of order) {
          if (cancelled) return;
          setFlash(colour);
          // Give the screen and the camera a moment to catch up, then average
          // the face's colour over the rest of this step.
          await sleep(170);
          const samples: Rgb[] = [];
          const until = performance.now() + 260;
          while (performance.now() < until) {
            if (latest?.colour) samples.push(latest.colour);
            await nextFrame();
          }
          if (samples.length > 0) {
            readings[colour] = {
              r: samples.reduce((sum, sample) => sum + sample.r, 0) / samples.length,
              g: samples.reduce((sum, sample) => sum + sample.g, 0) / samples.length,
              b: samples.reduce((sum, sample) => sum + sample.b, 0) / samples.length,
            };
          }
        }
        if (cancelled) return;
        setFlash(null);
        publish(engine.finishFlash(judgeFlash(readings), performance.now()));
      };

      const finish = (frame: ReturnType<typeof grabFrame>) => {
        if (!frame) {
          fail("failed");
          return;
        }
        setFinished(true);
        frame.canvas.toBlob(
          (blob) => {
            stopCamera();
            if (cancelled || !blob) return;
            passed.current(new File([blob], "time-in.jpg", { type: "image/jpeg" }), {
              ...engine.report(),
              sharpness: Math.round(frame.sharpness),
              duration_ms: Math.round(performance.now() - startedAt),
            });
          },
          "image/jpeg",
          0.92
        );
      };

      const loop = () => {
        if (cancelled) return;
        frameRequest = requestAnimationFrame(loop);
        // Only look at frames the camera has actually delivered.
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        latest = reader.read(performance.now());
        const next = engine.step(latest.sample);

        if (next.phase === "flash" && !flashStarted) {
          flashStarted = true;
          void runFlash();
        }
        const now = performance.now();
        if (!next.shoot) {
          kept = [];
        } else if (latest.box && (kept.length === 0 || now - kept[kept.length - 1].time >= KEEP_EVERY_MS)) {
          const frame = grabFrame(video, latest.box);
          if (frame) kept = [...kept.filter((entry) => now - entry.time <= KEEP_FOR_MS), { time: now, frame }];
        }

        publish(next);
        if (next.phase === "failed") fail("failed");
      };

      takeRef.current = () => {
        const now = performance.now();
        const next = engine.takePhoto(now);
        publish(next);
        if (next.phase !== "passed") return;
        cancelAnimationFrame(frameRequest);
        // The sharpest frame from just before the tap; the frame now if none.
        const recent = kept.filter((entry) => now - entry.time <= KEEP_FOR_MS);
        const best = recent.reduce<Kept | null>(
          (top, entry) => (!top || entry.frame.sharpness > top.frame.sharpness ? entry : top),
          null
        );
        finish(best?.frame ?? (latest?.box ? grabFrame(video, latest.box) : null));
      };
      expireRef.current = () => fail("expired");
      loop();
    })();

    return () => {
      cancelled = true;
      takeRef.current = null;
      expireRef.current = null;
      stopCamera();
    };
  }, [prompts, spare, strict, run]);

  // The ticket's last minute is counted down; when it runs out the camera
  // stops and a new check is offered.
  useEffect(() => {
    if (finished || problem) return;
    const tick = () => {
      const left = Math.ceil((expiresAt - Date.now()) / 1000);
      if (left <= 0) {
        setSecondsLeft(null);
        expireRef.current?.();
        return;
      }
      setSecondsLeft(left <= COUNTDOWN_FROM_S ? left : null);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, finished, problem]);

  const retry = () => {
    setProblem(null);
    setView(null);
    setFinished(false);
    setStarting(true);
    setRun((count) => count + 1);
  };

  if (problem) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3.5 ring-1 ring-inset ring-amber-600/20">
          <Icon name="alert" className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950">{PROBLEMS[problem].title}</p>
            <p className="mt-0.5 text-sm text-amber-900">{PROBLEMS[problem].detail}</p>
          </div>
        </div>
        {problem === "expired" ? (
          <Button block variant="secondary" icon="refresh" onClick={onRenew}>
            Start a new check
          </Button>
        ) : (
          <Button block variant="secondary" icon="refresh" onClick={retry}>
            Try again
          </Button>
        )}
        <SupervisorTip />
      </div>
    );
  }

  const phase = view?.phase ?? "position";
  const prompt = view?.current ? PROMPT_TEXT[view.current] : null;
  const hint = view ? HINT_TEXT[view.hint] : "";

  // While framing, the one thing to fix is the headline; nothing is said twice.
  let instruction = hint || "Fit your face in the oval";
  let detail = "";
  if (starting) {
    instruction = "Starting the camera";
    detail = "Allow camera access if your browser asks.";
  } else if (finished) {
    instruction = "Got it";
    detail = "";
  } else if (flash || phase === "flash") {
    instruction = "Hold still";
    detail = "Checking the light on your face";
  } else if (phase === "prompt" && view?.celebrating) {
    instruction = "Good";
    detail = "";
  } else if (phase === "prompt" && prompt) {
    instruction = prompt.text;
    detail = hint;
  } else if (phase === "capture" && view?.shoot) {
    instruction = "Ready when you are";
    detail = "Tap the round button to take your photo";
  } else if (phase === "capture") {
    instruction = "Look at the camera";
    detail = hint || "Hold still";
  } else if (phase === "position" && view?.notice) {
    // Why it started over stays as the headline; what to fix comes under it.
    instruction = NOTICE_TEXT[view.notice];
    detail =
      hint ||
      (view.notice === "try-again" ? `Attempt ${view.attempts} of ${MAX_ATTEMPTS}` : "Fit your face in the oval");
  }
  const waitingForTap = phase === "capture" && !finished && !starting;
  const ready = waitingForTap && Boolean(view?.shoot);

  const working = phase === "prompt" || phase === "capture";
  const ovalColour = finished || view?.celebrating || ready ? "#34d399" : working ? "#fac515" : "#ffffff";
  const steps = view ? view.prompts.length + 1 : prompts.length + 1;
  const stepsDone = finished ? steps : (view?.done ?? 0);

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[17rem] overflow-hidden rounded-2xl bg-psu-950 shadow-raised sm:max-w-xs">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Your camera"
          className="h-full w-full -scale-x-100 object-cover"
        />
        {/* The oval the face should fill; everything outside it is dimmed. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 300 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            fillRule="evenodd"
            fill="rgb(10 20 71 / 0.55)"
            d="M0 0H300V400H0Z M150 60a96 126 0 1 0 0.01 0Z"
          />
          <ellipse
            cx="150"
            cy="186"
            rx="96"
            ry="126"
            fill="none"
            stroke={ovalColour}
            strokeWidth="3.5"
            strokeDasharray={working || finished ? undefined : "10 8"}
            style={{ transition: "stroke 0.2s ease" }}
          />
        </svg>
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-psu-950">
            <BrandLoader variant="section" tone="onDark" process="timeIn" message="Starting the camera…" />
          </div>
        )}
        {(finished || view?.celebrating) && (
          <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-dialog-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-raised">
            <Icon name="check" size={28} strokeWidth={2.5} />
          </span>
        )}
        {secondsLeft !== null && !finished && (
          <span className="tabular absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
            <span className="sr-only">Time left for this check: </span>
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        )}
        {/* The shutter: centred at the bottom of the frame, above the phone's safe area. */}
        {waitingForTap && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => takeRef.current?.()}
              disabled={!ready}
              aria-label="Take photo"
              aria-describedby="liveness-instruction"
              className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-white shadow-raised transition-[background-color,opacity] duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${
                ready ? "bg-white hover:bg-gold-50" : "cursor-not-allowed bg-white/20 opacity-60"
              }`}
            >
              <Icon name="camera" size={26} className={ready ? "text-psu-800" : "text-white"} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 text-center" role="status" aria-live="polite">
        <p id="liveness-instruction" className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-900">
          {phase === "prompt" && prompt && !view?.celebrating && prompt.icon !== "user" && (
            <Icon
              name={prompt.icon}
              size={20}
              className={`text-psu-600 ${prompt.flip ? "rotate-180" : ""}`}
            />
          )}
          {instruction}
        </p>
        <p className="mt-0.5 min-h-5 text-sm text-slate-500">{detail}</p>
      </div>

      {/* One dot per prompt, and a last one for the photo. */}
      <ol className="mt-3 flex items-center justify-center gap-1.5" aria-label="Progress">
        {Array.from({ length: steps }, (_, index) => (
          <li
            key={index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index < stepsDone
                ? "w-6 bg-psu-600"
                : index === stepsDone && !starting
                  ? "w-6 bg-gold-400"
                  : "w-1.5 bg-slate-300"
            }`}
          />
        ))}
      </ol>

      {!finished && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-center font-semibold text-psu-700 hover:underline">
            Having trouble?
          </summary>
          <div className="mt-3">
            <SupervisorTip />
          </div>
        </details>
      )}

      {/* The colour flash: the whole screen becomes the light source. */}
      {flash &&
        createPortal(
          <div
            className="fixed inset-0 z-(--z-flash) flex items-center justify-center"
            style={{ background: FLASH_COLOURS[flash], transition: "background-color 0.12s linear" }}
          >
            <p className="rounded-full bg-black/55 px-5 py-2.5 text-base font-semibold text-white">
              Hold still
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}

/** What to do when the camera check will not work on this device. */
function SupervisorTip() {
  return (
    <p className="flex items-start gap-2.5 rounded-lg bg-psu-50/70 px-3 py-2.5 text-left text-sm text-slate-600 ring-1 ring-inset ring-psu-600/10">
      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-psu-600" />
      <span>
        If the camera check won't work on your device, ask your supervisor to record your
        time-in. They take your photo from the supervisor portal, under{" "}
        <span className="font-medium text-slate-800">Attendance → Record time-in</span>.
      </span>
    </p>
  );
}
