import { API_URL, withStudentAuth } from "./api";
import { readRecord, savedFetch } from "./offlineStore";

/*
| Phase 2.1: the location check at time-in (backend services/geofence.ts).
|
| When the OJT office turns it on, the phone asks for its location once, at
| time-in. Online, it sends the fix and the server keeps only the distance
| from the company's point. Offline, it works the distance out itself from
| the company's point kept here, and sends only that. Saying no, or no fix,
| never stops the time-in: the supervisor confirms the day.
*/

export type GeoMode = "off" | "record" | "review_outside";
type Fence = { latitude: number; longitude: number; radius_m: number };
type FenceAnswer = { mode: GeoMode; fence: Fence | null };

const NAME = "geofence";

/** Settles within `ms`, with `fallback` if the promise has not by then. */
const within = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))]);

/** The rule and the company's point, kept for offline use. A slow server never holds up a time-in: after 5 s, the kept copy. */
export async function readGeofence(studentId: string): Promise<FenceAnswer> {
  const fresh = (async () => {
    try {
      const response = await savedFetch("student", NAME, `${API_URL}/api/students/${encodeURIComponent(studentId)}/geofence`, withStudentAuth());
      if (response.ok) return (await response.json()) as FenceAnswer;
    } catch {
      /* no connection and nothing kept: the kept copy below, or off */
    }
    return null;
  })();
  return (await within(fresh, 5_000, null)) ?? (await readRecord<FenceAnswer>("student", NAME)) ?? { mode: "off", fence: null };
}

type Fix = { latitude: number; longitude: number } | { problem: "denied" | "unavailable" };

/**
 * Asks the phone for its location once. Never throws, and always settles:
 * the browser's own timeout does not count the time its permission prompt
 * is left open, so a hard limit a little past it ends the wait regardless.
 */
export function askLocation(timeoutMs = 10_000): Promise<Fix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({ problem: "unavailable" });
  const asked = new Promise<Fix>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => resolve({ problem: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
  return within(asked, timeoutMs + 2_000, { problem: "unavailable" });
}

/** The great-circle distance in metres, as the server works it out. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The fields an online time-in sends: the fix (the server keeps only the distance), or why there is none. */
export async function onlineGeoFields(studentId: string): Promise<Record<string, string>> {
  const { mode } = await readGeofence(studentId);
  if (mode === "off") return {};
  const fix = await askLocation();
  return "problem" in fix ? { location: fix.problem } : { latitude: String(fix.latitude), longitude: String(fix.longitude) };
}

/** The fields an offline time-in sends: the distance worked out here, never the fix. */
export async function offlineGeoFields(): Promise<Record<string, string>> {
  const kept = await readRecord<FenceAnswer>("student", NAME);
  if (!kept || kept.mode === "off") return {};
  const fix = await askLocation();
  if ("problem" in fix) return { geo_status: fix.problem };
  if (!kept.fence) return { geo_status: "no_fence" };
  const distance = Math.round(distanceMeters(fix, kept.fence) / 10) * 10;
  return { geo_status: distance <= kept.fence.radius_m ? "inside" : "outside", geo_distance_m: String(distance) };
}

/** "16.02, 120.23", a Google Maps link with @16.02,120.23, or two numbers anywhere in the text. */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const found = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!found) return null;
  const latitude = Number(found[1]);
  const longitude = Number(found[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
