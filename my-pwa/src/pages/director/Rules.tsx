import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { errorText, toast } from "../../lib/toast";
import type { GeoMode } from "../../lib/geofence";
import { directorRead, directorWrite } from "./request";

/*
| The OJT rules (backend services/ojtSettings.ts), changed only here once a
| Director exists. Each change says what will happen, with the value now
| and after, and is kept in the audit log with both. The overtime limit and
| the grade split join this page with their items (1.4, 1.5).
*/

type Settings = { deployment_gate_enabled: boolean; grade_split_hte: number; geofence_mode?: GeoMode };
const GEO_WORDS: Record<GeoMode, { name: string; effect: string }> = {
  off: { name: "Off", effect: "No location is asked for at time-in." },
  record: { name: "Record the distance", effect: "At time-in the phone asks for its location once; only the distance from the company is kept and shown to the supervisor." },
  review_outside: { name: "Review outside the area", effect: "As recording, and a time-in outside the company's area, or with no location, waits for the supervisor instead of counting by itself. It is never refused." },
};
type Flag = "deployment_gate_enabled";

const RULES: { key: Flag; name: string; on: string; off: string; turnOn: string; turnOff: string }[] = [
  {
    key: "deployment_gate_enabled",
    name: "Deployment gate",
    on: "Only students cleared for deployment can time in, offline or recorded by their supervisor.",
    off: "Every student can time in, cleared or not. Coordinators still clear students on their Clearance board.",
    turnOn: "Students who are not cleared will not be able to time in until their coordinator clears them.",
    turnOff: "Every student will be able to time in again, cleared or not.",
  },
];

export default function DirectorRules() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState<(typeof RULES)[number] | null>(null);
  const [saving, setSaving] = useState(false);
  // Phase 1.5: the HTE's share of the final grade.
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitText, setSplitText] = useState("");
  const [splitError, setSplitError] = useState("");
  // Phase 2.1: the location check at time-in.
  const [geoNext, setGeoNext] = useState<GeoMode | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings((await directorRead<{ settings: Settings }>("rules", "/api/coordinator/ojt-settings")).settings);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The rules could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!changing || !settings) return;
    const next = !settings[changing.key];
    setSaving(true);
    try {
      await directorWrite(`/api/coordinator/ojt-settings/${changing.key}`, "PUT", { value: next });
      toast.success(`${changing.name} turned ${next ? "on" : "off"}.`);
      setChanging(null);
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The rule could not be changed. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const nextSplit = Number(splitText);
  const saveSplit = async () => {
    if (!Number.isInteger(nextSplit) || nextSplit < 1 || nextSplit > 99) {
      setSplitError("The HTE's share is a whole number from 1 to 99.");
      return;
    }
    setSaving(true);
    setSplitError("");
    try {
      await directorWrite("/api/coordinator/ojt-settings/grade_split_hte", "PUT", { value: nextSplit });
      toast.success(`Final grade split changed to HTE ${nextSplit}%, instructor ${100 - nextSplit}%.`);
      setSplitOpen(false);
      await load();
    } catch (saveError) {
      setSplitError(errorText(saveError, "The split could not be changed. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const saveGeo = async () => {
    if (!geoNext) return;
    setSaving(true);
    try {
      await directorWrite("/api/coordinator/ojt-settings/geofence_mode", "PUT", { value: geoNext });
      toast.success(`Location check: ${GEO_WORDS[geoNext].name.toLowerCase()}.`);
      setGeoNext(null);
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The rule could not be changed. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const now = changing && settings ? settings[changing.key] : false;
  return (
    <DirectorLayout title="Rules">
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      <Card>
        {!settings && !error ? (
          <div className="p-4">
            <SkeletonRows rows={2} />
          </div>
        ) : settings ? (
          <ul className="divide-y divide-slate-100">
            {RULES.map((rule) => {
              const value = settings[rule.key];
              return (
                <li key={rule.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-(--role-ink)">{rule.name}</h2>
                      <StatusBadge status={value ? "On" : "Off"} tone={value ? "good" : "neutral"} />
                    </div>
                    <p className="mt-1 max-w-[65ch] text-sm text-slate-700">{value ? rule.on : rule.off}</p>
                  </div>
                  <Button variant="secondary" onClick={() => setChanging(rule)}>
                    {value ? `Turn the ${rule.name.toLowerCase()} off` : `Turn the ${rule.name.toLowerCase()} on`}
                  </Button>
                </li>
              );
            })}
            <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-(--role-ink)">Final grade split</h2>
                <p className="mt-1 max-w-[65ch] text-sm text-slate-700">
                  HTE {settings.grade_split_hte}%, instructor {100 - settings.grade_split_hte}%, pending the university's confirmation. Grades already released keep the value they were released with.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSplitText(String(settings.grade_split_hte));
                  setSplitError("");
                  setSplitOpen(true);
                }}
              >
                Change the split
              </Button>
            </li>
            <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-(--role-ink)">Location check at time-in</h2>
                  <StatusBadge status={GEO_WORDS[settings.geofence_mode ?? "off"].name} tone={(settings.geofence_mode ?? "off") === "off" ? "neutral" : "good"} />
                </div>
                <p className="mt-1 max-w-[65ch] text-sm text-slate-700">{GEO_WORDS[settings.geofence_mode ?? "off"].effect}</p>
              </div>
              <label className="block sm:w-64">
                <span className="sr-only">Change the location check</span>
                <select
                  className="field"
                  value={settings.geofence_mode ?? "off"}
                  onChange={(event) => setGeoNext(event.target.value as GeoMode)}
                >
                  {(Object.keys(GEO_WORDS) as GeoMode[]).map((mode) => (
                    <option key={mode} value={mode}>{GEO_WORDS[mode].name}</option>
                  ))}
                </select>
              </label>
            </li>
          </ul>
        ) : null}
      </Card>

      <ConfirmDialog
        open={changing !== null}
        title={changing ? `Turn the ${changing.name.toLowerCase()} ${now ? "off" : "on"}?` : ""}
        message={changing ? `Now: ${now ? "on" : "off"}. After: ${now ? "off" : "on"}. ${now ? changing.turnOff : changing.turnOn}` : undefined}
        confirmLabel={changing ? `Turn the ${changing.name.toLowerCase()} ${now ? "off" : "on"}` : ""}
        busy={saving}
        onConfirm={() => void save()}
        onCancel={() => setChanging(null)}
      />
      <ConfirmDialog
        open={geoNext !== null}
        title="Change the location check?"
        message={settings && geoNext ? `Now: ${GEO_WORDS[settings.geofence_mode ?? "off"].name}. After: ${GEO_WORDS[geoNext].name}. ${GEO_WORDS[geoNext].effect}` : undefined}
        confirmLabel="Change the location check"
        busy={saving}
        onConfirm={() => void saveGeo()}
        onCancel={() => setGeoNext(null)}
      />
      <ConfirmDialog
        open={splitOpen}
        title="Change the final grade split?"
        message={settings ? `Now: HTE ${settings.grade_split_hte}%, instructor ${100 - settings.grade_split_hte}%. After: ${Number.isInteger(nextSplit) && nextSplit >= 1 && nextSplit <= 99 ? `HTE ${nextSplit}%, instructor ${100 - nextSplit}%` : "give a whole number from 1 to 99"}. Every grade not yet released is worked out again.` : undefined}
        confirmLabel="Change the split"
        busy={saving}
        onConfirm={() => void saveSplit()}
        onCancel={() => setSplitOpen(false)}
      >
        <FormField label="HTE share, in percent" htmlFor="grade-split">
          <input id="grade-split" type="number" inputMode="numeric" min={1} max={99} step={1} className="field" value={splitText} onChange={(event) => setSplitText(event.target.value)} />
        </FormField>
        <div className="mt-2"><FormError message={splitError} /></div>
      </ConfirmDialog>
    </DirectorLayout>
  );
}
