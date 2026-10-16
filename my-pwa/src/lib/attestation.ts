/*
|--------------------------------------------------------------------------
| THE TEXT A PHONE SIGNS FOR AN OFFLINE TIME-IN
|--------------------------------------------------------------------------
|
| Kept apart, with no imports, so the backend's tests can check that the
| app and the server build exactly the same string
| (backend services/offlineAttestation.ts).
|
*/

/**
 * The exact text the phone signs; the server builds the same
 * (backend services/offlineAttestation.ts). The order is fixed.
 */
export function attestationMessage(attestation: {
  voucher_jti: string;
  key_id: string;
  photo_sha256: string;
  local_time: string;
  counter: number;
  offset_at_issue_ms: number;
}): string {
  return JSON.stringify([
    "internet-offline-time-in-v1",
    attestation.voucher_jti,
    attestation.key_id,
    attestation.photo_sha256,
    attestation.local_time,
    attestation.counter,
    attestation.offset_at_issue_ms,
  ]);
}
