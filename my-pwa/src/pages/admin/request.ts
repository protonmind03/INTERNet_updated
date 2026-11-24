import { API_URL, withAdminAuth } from "../../lib/api";

/*
| The administrator's calls (Phase 1.7). Nothing here goes through
| savedFetch: the portal keeps nothing on the device but its own account
| and the maintenance notice (DEVELOPING.md, "Working offline"). A failed
| request throws the server's own message, with its code when it has one.
*/

export type AdminFailure = Error & { code?: string; status?: number };

export async function adminRequest<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    withAdminAuth({
      method: options.method || "GET",
      signal: options.signal,
      ...(options.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}),
    })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure: AdminFailure = new Error(
      typeof data.message === "string" && data.message ? data.message : "That did not work. Check your connection and try again."
    );
    if (typeof data.code === "string") failure.code = data.code;
    failure.status = response.status;
    throw failure;
  }
  return data as T;
}

/** A file the server builds (the audit log as CSV), saved through the administrator's session. */
export async function adminDownload(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, withAdminAuth());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.message === "string" && data.message ? data.message : "The file could not be made.");
  }
  const name = /filename="?([^";]+)"?/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
