/*
| Fetches a file the server sends to a signed-in person and saves it under
| the name the server gives (Content-Disposition), or `fallbackName`. A
| refusal throws the server's own message. Used for the audit log's CSV
| (admin) and a company's signed agreement (coordinator).
*/
export async function saveFile(url: string, init: RequestInit, fallbackName: string): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.message === "string" && data.message ? data.message : "The file could not be opened.");
  }
  const name = /filename="?([^";]+)"?/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
