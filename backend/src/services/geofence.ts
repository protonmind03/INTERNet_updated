import type { Pool, PoolClient } from "pg";
import { ojtSetting } from "./ojtSettings";

/*
|--------------------------------------------------------------------------
| THE GEOFENCE AT TIME-IN, BY DISTANCE ONLY (Phase 2.1, migration 085)
|--------------------------------------------------------------------------
|
| Off unless the OJT rule geofence_mode says otherwise:
|
|   off             nothing is asked or kept
|   record          the distance is kept and shown to the supervisor
|   review_outside  as record, and a time-in outside the radius, with the
|                   location denied or not found, waits for the supervisor
|                   instead of counting by itself
|
| A time-in is never refused for where it was made. The phone's fix is used
| to work out the distance and dropped: only the distance (to 10 m) and
| inside or outside are kept. An offline time-in sends the distance the
| phone worked out from the company's point, and it is kept as reported by
| the phone (geo_source 'phone').
|
*/

type Db = Pick<Pool | PoolClient, "query">;

export type GeoStatus = "inside" | "outside" | "denied" | "unavailable" | "no_fence";
export type GeoResult = { status: GeoStatus; distance_m: number | null; source: "server" | "phone"; needs_review: boolean };
export type Fence = { latitude: number; longitude: number; radius_m: number };

/** The great-circle distance in metres (haversine). */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const roundTo10 = (metres: number) => Math.round(metres / 10) * 10;

const number = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The student's company's fence, when it has a point. */
export async function fenceOf(db: Db, studentId: string): Promise<Fence | null> {
  const row = (
    await db.query<{ latitude: string | null; longitude: string | null; radius_m: number }>(
      `SELECT c.latitude, c.longitude, c.radius_m FROM students s JOIN companies c ON c.id = s.company_id WHERE s.student_id = $1`,
      [studentId]
    )
  ).rows[0];
  if (!row || row.latitude === null || row.longitude === null) return null;
  return { latitude: Number(row.latitude), longitude: Number(row.longitude), radius_m: Number(row.radius_m) };
}

/**
 * What to keep about where a time-in was made, or null when the rule is
 * off. `body` is the request's fields:
 *
 *   latitude, longitude   the phone's fix (online): the server works it out
 *   location              "denied" or "unavailable" when there is no fix
 *   geo_status, geo_distance_m
 *                         an offline time-in's own result, from the phone
 */
export async function judgeGeo(db: Db, studentId: string, body: Record<string, unknown> | undefined, from: "online" | "offline"): Promise<GeoResult | null> {
  const mode = await ojtSetting(db, "geofence_mode");
  if (mode === "off") return null;
  const input = body ?? {};
  const review = (status: GeoStatus) => mode === "review_outside" && (status === "outside" || status === "denied" || status === "unavailable");
  const fence = await fenceOf(db, studentId);

  // An offline time-in: the phone's own result, kept as the phone's.
  if (from === "offline" && typeof input.geo_status === "string") {
    const status = (["inside", "outside", "denied", "unavailable", "no_fence"] as const).find((value) => value === input.geo_status) ?? "unavailable";
    const reported = number(input.geo_distance_m);
    const distance = (status === "inside" || status === "outside") && reported !== null && reported >= 0 && reported < 20_000_000 ? roundTo10(reported) : null;
    const final: GeoStatus = !fence && status !== "denied" && status !== "unavailable" ? "no_fence" : status;
    return { status: final, distance_m: final === "no_fence" ? null : distance, source: "phone", needs_review: review(final) };
  }

  const latitude = number(input.latitude);
  const longitude = number(input.longitude);
  const fix = latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  if (!fix) {
    const status: GeoStatus = input.location === "denied" ? "denied" : "unavailable";
    return { status, distance_m: null, source: "server", needs_review: review(status) };
  }
  if (!fence) return { status: "no_fence", distance_m: null, source: "server", needs_review: false };
  const distance = roundTo10(distanceMeters({ latitude: latitude!, longitude: longitude! }, fence));
  const status: GeoStatus = distance <= fence.radius_m ? "inside" : "outside";
  return { status, distance_m: distance, source: "server", needs_review: review(status) };
}

/** A company's point and radius as sent by the coordinator, or the problem. Nulls clear the point. */
export function readFence(body: Record<string, unknown>): { latitude: number | null; longitude: number | null; radius_m: number } | { problem: string } {
  const latitude = number(body.latitude);
  const longitude = number(body.longitude);
  const radius = body.radius_m === undefined || body.radius_m === null || body.radius_m === "" ? 200 : Number(body.radius_m);
  if ((latitude === null) !== (longitude === null)) return { problem: "Give both the latitude and the longitude, or neither." };
  // Clearing the point needs no radius: whatever the box says, the default is kept.
  const radiusOk = Number.isInteger(radius) && radius >= 20 && radius <= 5000;
  if (latitude === null || longitude === null) return { latitude: null, longitude: null, radius_m: radiusOk ? radius : 200 };
  if (!radiusOk) return { problem: "The radius is a whole number of metres from 20 to 5000." };
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { problem: "That is not a place on Earth: latitude is -90 to 90, longitude -180 to 180." };
  const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
  return { latitude: round6(latitude), longitude: round6(longitude), radius_m: radius };
}
