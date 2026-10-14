import { useSyncExternalStore } from "react";

/*
|--------------------------------------------------------------------------
| SOUNDS AND VIBRATION
|--------------------------------------------------------------------------
|
| Five short cues, each with one meaning, so a step can be told apart
| without looking at the screen:
|
|   committed  the server has recorded a time-in or a time-out
|   saved      kept on this phone, to be sent later. Softer than
|              "committed" and plainly different: that difference is
|              what the cue is for
|   sent       steps kept on the phone have now reached the server
|   refused    the server said no. Low and neutral, not an alarm
|   attention  something new to review arrived while the app is open
|              (supervisors and coordinators only)
|
| The tones are made here with the Web Audio API, each under 200 ms. No
| sound file is used. Sound is OFF until the person turns it on, and
| vibration is ON, on phones that have it (Android; iPhones do not let a
| web app vibrate). Both choices are kept on this device only.
|
| Every cue is also announced as a window event, "internet-cue", which
| is how the end-to-end tests can tell a cue was given.
|
*/

export type Cue = "committed" | "saved" | "sent" | "refused" | "attention";

export type CueSettings = { sound: boolean; vibrate: boolean };

const KEY = "inb_cues";
const DEFAULTS: CueSettings = { sound: false, vibrate: true };
export const CUE_EVENT = "internet-cue";

let settings: CueSettings = read();
const listeners = new Set<() => void>();

function read(): CueSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<CueSettings> | null;
    return {
      sound: typeof saved?.sound === "boolean" ? saved.sound : DEFAULTS.sound,
      vibrate: typeof saved?.vibrate === "boolean" ? saved.vibrate : DEFAULTS.vibrate,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function cueSettings(): CueSettings {
  return settings;
}

export function setCueSettings(next: Partial<CueSettings>): void {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Kept for this visit only when the browser will not store it. */
  }
  for (const listener of listeners) listener();
}

/** The current choices, kept up to date on screen. */
export function useCueSettings(): CueSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings
  );
}

/** Whether this device can vibrate for a web app at all. */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

// One note: frequency in Hz, start and length in seconds, how loud (0 to 1).
type Note = { hz: number; at: number; length: number; level: number; wave: OscillatorType; slideTo?: number };

const TONES: Record<Cue, Note[]> = {
  // Two notes going up, clear: done, and on the server.
  committed: [
    { hz: 659.25, at: 0, length: 0.07, level: 0.22, wave: "sine" },
    { hz: 987.77, at: 0.075, length: 0.1, level: 0.22, wave: "sine" },
  ],
  // One soft, round note: kept, not yet done.
  saved: [{ hz: 523.25, at: 0, length: 0.12, level: 0.12, wave: "triangle" }],
  // Two quick high notes: what was waiting has gone.
  sent: [
    { hz: 783.99, at: 0, length: 0.05, level: 0.16, wave: "sine" },
    { hz: 1046.5, at: 0.06, length: 0.07, level: 0.16, wave: "sine" },
  ],
  // One low note that falls a little: no.
  refused: [{ hz: 220, at: 0, length: 0.16, level: 0.2, wave: "sine", slideTo: 185 }],
  // Two even notes: look.
  attention: [
    { hz: 587.33, at: 0, length: 0.06, level: 0.16, wave: "triangle" },
    { hz: 587.33, at: 0.1, length: 0.06, level: 0.16, wave: "triangle" },
  ],
};

const PATTERNS: Record<Cue, number[]> = {
  committed: [30],
  saved: [12],
  sent: [18, 40, 18],
  refused: [60, 50, 60],
  attention: [25, 60, 25],
};

let context: AudioContext | null = null;

function play(notes: Note[]): void {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  context ??= new Context();
  // A browser starts audio suspended until the page has been touched.
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  const start = context.currentTime + 0.01;
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.hz, start + note.at);
    if (note.slideTo) oscillator.frequency.linearRampToValueAtTime(note.slideTo, start + note.at + note.length);
    // A short rise and fall, so no note clicks.
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(note.level, start + note.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + note.at);
    oscillator.stop(start + note.at + note.length + 0.02);
  }
}

/**
 * Gives one cue, as this device is set up for: a tone if sound is on, a
 * buzz if vibration is on and the phone can. Never throws.
 */
export function cue(kind: Cue, options: { force?: boolean } = {}): void {
  try {
    window.dispatchEvent(new CustomEvent(CUE_EVENT, { detail: kind }));
    if (settings.sound || options.force) play(TONES[kind]);
    if (settings.vibrate && canVibrate()) navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* A cue is a courtesy; failing to give one must never interrupt anything. */
  }
}
