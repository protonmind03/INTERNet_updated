// A production build without VITE_API_URL would silently call localhost and
// every request would fail, so stop the build's output from loading instead.
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error(
    "VITE_API_URL is not set. Configure it in the hosting build environment and redeploy."
  );
}

export const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export const PASSWORD_POLICY_HINT =
  "Use 12–128 characters with at least one uppercase letter, one lowercase letter, and one number.";

/** Mirrors the server's password rule so forms can explain it before submitting. */
export function passwordPolicyError(password: string): string | null {
  const valid =
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password);
  return valid ? null : PASSWORD_POLICY_HINT;
}

/**
 * A password change ends every other session and returns a new token for
 * this device; store it so the current session keeps working.
 */
export function storeRotatedToken(
  role: "coordinator" | "student" | "supervisor",
  token: unknown
): void {
  if (typeof token !== "string" || !token) return;
  localStorage.setItem(`${role}_token`, token);
  window.dispatchEvent(new Event("internet-auth-changed"));
}

export function withRoleAuth(
  role: "coordinator" | "student" | "supervisor",
  options: RequestInit = {}
): RequestInit {
  const token = localStorage.getItem(`${role}_token`);
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export function withStudentAuth(options: RequestInit = {}): RequestInit {
  return withRoleAuth("student", options);
}

export function withSupervisorAuth(options: RequestInit = {}): RequestInit {
  return withRoleAuth("supervisor", options);
}

/**
 * Attaches the coordinator's bearer token (if present) to fetch options.
 * Coordinator-only endpoints on the backend reject requests without it.
 */
export function withCoordinatorAuth(
  options: RequestInit = {}
): RequestInit {
  const token = localStorage.getItem("coordinator_token");

  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export async function getProtectedUploadUrl(
  filePath: string,
  role: "coordinator" | "student" | "supervisor"
): Promise<string> {
  const filename = filePath.split(/[\\/]/).pop();
  if (!filename || filename === "." || filename === "..") {
    throw new Error("Invalid uploaded file path.");
  }

  const response = await fetch(
    `${API_URL}/api/uploads/${encodeURIComponent(filename)}`,
    withRoleAuth(role)
  );
  if (!response.ok) {
    throw new Error(`Unable to retrieve file (${response.status}).`);
  }

  return URL.createObjectURL(await response.blob());
}

export async function downloadProtectedUpload(
  filePath: string,
  role: "coordinator" | "student" | "supervisor"
): Promise<void> {
  const objectUrl = await getProtectedUploadUrl(filePath, role);
  const filename = filePath.split(/[\\/]/).pop() || "download";
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
