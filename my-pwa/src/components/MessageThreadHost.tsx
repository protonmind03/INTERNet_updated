import { useSearchParams } from "react-router-dom";
import type { SessionRole } from "../lib/session";
import ComposeMessage from "./ComposeMessage";

/**
 * Opens a message thread to reply to when the address has ?thread=, which is
 * where the "New message" notification leads (backend routes/messages.ts).
 * Closing it takes ?thread= off the address and leaves the page as it was.
 */
export default function MessageThreadHost({ role }: { role: SessionRole }) {
  const [params, setParams] = useSearchParams();
  const threadId = Number(params.get("thread"));
  if (!Number.isInteger(threadId) || threadId <= 0) return null;

  const close = () => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("thread");
        return next;
      },
      { replace: true }
    );
  };

  return <ComposeMessage key={threadId} role={role} threadId={threadId} onClose={close} />;
}
