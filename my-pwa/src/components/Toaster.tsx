import { useEffect, useState } from "react";
import Icon from "./Icon";
import { dismissToast, subscribeToToasts, type ToastMessage } from "../lib/toast";

const TONES = {
  success: { icon: "check-circle", accent: "text-emerald-600", bar: "bg-emerald-500" },
  error: { icon: "alert", accent: "text-red-600", bar: "bg-red-500" },
  info: { icon: "info", accent: "text-psu-600", bar: "bg-psu-600" },
} as const;

/** Renders the messages raised through `toast.*`. Mounted once in App. */
export default function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToToasts(setMessages), []);

  if (messages.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
      aria-live="polite"
    >
      {messages.map((message) => {
        const tone = TONES[message.tone];
        return (
          <div
            key={message.id}
            role={message.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pl-0 pr-3 shadow-lg"
          >
            <span className={`w-1 self-stretch rounded-r ${tone.bar}`} />
            <Icon name={tone.icon} className={`mt-0.5 shrink-0 ${tone.accent}`} />
            <p className="min-w-0 flex-1 text-sm text-slate-700">{message.text}</p>
            {message.action && (
              <button
                type="button"
                onClick={() => {
                  message.action?.onClick();
                  dismissToast(message.id);
                }}
                className="shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-psu-700 hover:bg-psu-50"
              >
                {message.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => dismissToast(message.id)}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
