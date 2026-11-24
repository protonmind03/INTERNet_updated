import { useState } from "react";
import { Button, Card, CardHeader, FormError, FormField } from "../../components/ui";
import { askLocation, parseCoordinates } from "../../lib/geofence";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.1: a company's point and radius for the location check at time-in.
| Pasted as "16.020833, 120.231944" (as a map app copies it), typed, or this
| phone's location while standing at the company. No map is loaded. The
| company's point is not personal; a trainee's own position is never kept.
*/

type Located = { id: number; name: string; latitude?: number | null; longitude?: number | null; radius_m?: number };

export default function CompanyLocation({ company, onSaved }: { company: Located; onSaved: () => void }) {
  const has = company.latitude !== null && company.latitude !== undefined && company.longitude !== null && company.longitude !== undefined;
  const [text, setText] = useState(has ? `${company.latitude}, ${company.longitude}` : "");
  const [radius, setRadius] = useState(String(company.radius_m ?? 200));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (point: { latitude: number; longitude: number } | null) => {
    setBusy(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/company-records/${company.id}/geofence`, {
        method: "PUT",
        body: { latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, radius_m: Number(radius) },
      });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The location could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const takePhoneLocation = async () => {
    setBusy(true);
    setError("");
    const fix = await askLocation(15_000);
    setBusy(false);
    if ("problem" in fix) {
      setError(fix.problem === "denied" ? "This phone did not share its location. Allow it in the browser, or paste the coordinates." : "No location was found. Try outdoors, or paste the coordinates.");
      return;
    }
    setText(`${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`);
  };

  const submit = () => {
    const point = parseCoordinates(text);
    if (!point) {
      setError("Paste the coordinates as two numbers, such as 16.020833, 120.231944.");
      return;
    }
    void save(point);
  };

  return (
    <Card>
      <CardHeader icon="map-pin" title="Location for the time-in check" description="Used only when the OJT office turns the location check on. Only the distance from this point is kept." />
      <div className="space-y-3 px-4 pb-5 pt-3 sm:px-5">
        <p className="text-sm text-slate-600">
          {has ? `Set: ${company.latitude}, ${company.longitude}, within ${company.radius_m ?? 200} m.` : "No location set: time-ins here are recorded without a distance."}
        </p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <FormField label="Coordinates" htmlFor="company-coordinates" hint="Paste from a map app, or a Google Maps link.">
            <input id="company-coordinates" className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder="16.020833, 120.231944" />
          </FormField>
          <FormField label="Radius (m)" htmlFor="company-radius">
            <input id="company-radius" type="number" min={20} max={5000} step={10} className="field" value={radius} onChange={(event) => setRadius(event.target.value)} />
          </FormField>
        </div>
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button busy={busy} onClick={submit}>Save the location</Button>
          <Button variant="secondary" icon="map-pin" disabled={busy} onClick={() => void takePhoneLocation()}>
            Use this phone's location
          </Button>
          {has && (
            <Button variant="secondary" disabled={busy} onClick={() => void save(null)}>
              Remove the location
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
