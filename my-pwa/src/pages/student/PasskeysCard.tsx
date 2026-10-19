import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog } from "../../components/ui";
import { formatLongDate } from "../../lib/format";
import { listPasskeys, passkeysAvailable, registerPasskey, removePasskey, type PasskeyDevice } from "../../lib/passkeys";
import { errorText, toast } from "../../lib/toast";

/*
| Iteration 22: the trainee's passkeys (Profile › Security and device). A
| passkey is this phone's own screen lock (fingerprint, face or PIN); with
| one, Lunch break, End break and Time out ask for it. It never stops a
| step: without it, the step is recorded as not confirmed.
*/

const defaultLabel = () => {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android phone";
  if (/Mac/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows computer";
  return "This device";
};

export default function PasskeysCard() {
  const [devices, setDevices] = useState<PasskeyDevice[] | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PasskeyDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await listPasskeys());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    void passkeysAvailable().then(setAvailable);
  }, [load]);

  const add = async () => {
    setAdding(true);
    try {
      await registerPasskey(defaultLabel());
      toast.success("Passkey added. Lunch break, End break and Time out will ask for it.");
      await load();
    } catch (error) {
      // The person closed the prompt: nothing to say beyond that it was not added.
      toast.error(errorText(error, "The passkey was not added."));
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await removePasskey(removing.id);
      toast.success("Passkey removed.");
      setRemoving(null);
      await load();
    } catch (error) {
      toast.error(errorText(error, "The passkey could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <section aria-labelledby="passkeys-heading" className="p-4 sm:p-5">
        <h3 id="passkeys-heading" className="text-sm font-semibold text-slate-900">
          Passkeys
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Confirm your lunch break, end of break and time-out with this phone's screen lock. If you skip it, the step is still
          recorded, and your supervisor sees it was not confirmed.
        </p>
        {devices && devices.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{device.device_label || "Passkey"}</span>
                  <span className="block text-xs text-slate-600">
                    Added {formatLongDate(device.created_at)}
                    {device.last_used_at ? ` · last used ${formatLongDate(device.last_used_at)}` : " · not used yet"}
                  </span>
                </span>
                <Button variant="secondary" size="sm" icon="trash" onClick={() => setRemoving(device)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {available === false ? (
          <p className="mt-3 text-sm text-slate-700">This browser cannot make a passkey with the phone's screen lock.</p>
        ) : (
          <Button className="mt-3" icon="lock" busy={adding} onClick={() => void add()} disabled={available === null}>
            {devices && devices.length > 0 ? "Add a passkey on this device" : "Add a passkey"}
          </Button>
        )}
      </section>
      <ConfirmDialog
        open={removing !== null}
        title="Remove this passkey?"
        message="Steps will no longer ask for it on that device."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}
