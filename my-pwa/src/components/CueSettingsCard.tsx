import { Card } from "./ui";
import { canVibrate, cue, setCueSettings, useCueSettings, type Cue } from "../lib/cues";

const SAMPLES: { cue: Cue; label: string }[] = [
  { cue: "committed", label: "Recorded" },
  { cue: "saved", label: "Saved on this phone" },
  { cue: "sent", label: "Sent" },
  { cue: "refused", label: "Not accepted" },
];

/**
 * Sounds and vibration for this device: off and on to begin with. The
 * buttons play each cue so the difference between them can be learned.
 */
export default function CueSettingsCard({ attention = false }: { attention?: boolean }) {
  const settings = useCueSettings();
  const vibration = canVibrate();
  const samples = attention ? [...SAMPLES, { cue: "attention" as const, label: "Something new to review" }] : SAMPLES;

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-[16px] font-bold text-slate-900">Sounds and vibration</h2>
      <p className="mt-1 text-sm text-slate-600">
        A short sound or buzz when a step is recorded, saved on this phone, sent or not accepted.
        These choices are kept on this device only.
      </p>
      <div className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
          <input
            type="checkbox"
            role="switch"
            checked={settings.sound}
            onChange={(event) => setCueSettings({ sound: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-psu-700 focus:ring-psu-500"
          />
          Sounds
        </label>
        <label
          className={`flex items-center gap-2.5 text-sm ${vibration ? "cursor-pointer text-slate-800" : "text-slate-500"}`}
        >
          <input
            type="checkbox"
            role="switch"
            checked={vibration && settings.vibrate}
            disabled={!vibration}
            onChange={(event) => setCueSettings({ vibrate: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-psu-700 focus:ring-psu-500"
          />
          Vibration
          {!vibration && <span className="text-xs">(this device or browser cannot vibrate for a web app)</span>}
        </label>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-600">Hear each one</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {samples.map((sample) => (
          <button
            key={sample.cue}
            type="button"
            // Played even with sound off: asking to hear it is asking for sound.
            onClick={() => cue(sample.cue, { force: true })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
