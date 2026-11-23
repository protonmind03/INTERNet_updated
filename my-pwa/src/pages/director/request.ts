import { API_URL, withDirectorAuth } from "../../lib/api";
import { savedFetch } from "../../lib/offlineStore";

/*
| The Director's calls. Reads go through savedFetch, so a page shows what
| it last loaded when there is no connection (DEVELOPING.md, "Working
| offline"); a change always needs one. A failed request throws the
| server's own message.
*/

async function failure(response: Response): Promise<Error & { code?: string }> {
  const data = await response.json().catch(() => ({}));
  const error: Error & { code?: string } = new Error(
    typeof data.message === "string" && data.message ? data.message : "That did not work. Check your connection and try again."
  );
  if (typeof data.code === "string") error.code = data.code;
  return error;
}

/** Reads, kept on this device under `name` for offline use. */
export async function directorRead<T>(name: string, path: string): Promise<T> {
  const response = await savedFetch("director", name, `${API_URL}${path}`, withDirectorAuth());
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

/** A change. Never kept for later. */
export async function directorWrite<T = Record<string, unknown>>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    withDirectorAuth({
      method,
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    })
  );
  if (!response.ok) throw await failure(response);
  return (await response.json().catch(() => ({}))) as T;
}
