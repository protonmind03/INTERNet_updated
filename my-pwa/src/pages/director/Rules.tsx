import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { errorText, toast } from "../../lib/toast";
import { directorRead, directorWrite } from "./request";

/*
| The OJT rules (backend services/ojtSettings.ts), changed only here once a
| Director exists. Each change says what will happen, with the value now
| and after, and is kept in the audit log with both. The overtime limit and
| the grade split join this page with their items (1.4, 1.5).
*/

type Settings = { deployment_gate_enabled: boolean };

const RULES: { key: keyof Settings; name: string; on: string; off: string; turnOn: string; turnOff: string }[] = [
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
    </DirectorLayout>
  );
}
