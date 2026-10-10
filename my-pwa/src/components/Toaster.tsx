import { useEffect, useState } from "react";
import { CapGlyph, CheckGlyph, RoadGlyph, ROLE_THEMES, getActiveRole } from "../brand";
import Icon from "./Icon";
import { dismissToast, subscribeToToasts, type ToastMessage } from "../lib/toast";

/** Renders the messages raised through `toast.*`. Mounted once in App. */
export default function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToToasts(setMessages), []);

  if (messages.length === 0) return null;

  // Toasts take the signed-in portal's surface: navy for students and
  // supervisors, white for the coordinator and the sign-in pages.
  const role = getActiveRole();
  const theme = ROLE_THEMES[role];
  const navy = role === "student" || role === "supervisor";

  return (
    <div
      className="float-toasts pointer-events-none fixed inset-x-0 z-(--z-toast) flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:items-end md:px-0 print:hidden"
      aria-live="polite"
    >
      {messages.map((message) => {
        const isError = message.tone === "error";
        const dark = navy && !isError;
        const accent = isError ? "#DC2626" : dark ? theme.colors.accent : "#152bb0";
        return (
          <div
            key={message.id}
            role={isError ? "alert" : "status"}
            className={`inb-toast-in pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl shadow-xl md:w-96 ${
              dark ? "text-white" : "border border-slate-200 bg-white text-slate-900"
            }`}
            style={{
              background: dark ? theme.colors.surface : undefined,
              boxShadow: isError
                ? "inset 3px 0 0 #DC2626, 0 20px 25px -5px rgba(0,0,0,.15)"
                : undefined,
            }}
          >
            <div className="flex items-start gap-3 p-3.5 pr-2">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: isError ? "#FEF2F2" : dark ? "rgba(250,204,21,.16)" : "#eef2ff",
                  color: accent,
                }}
              >
                {message.tone === "working" && <RoadGlyph size={16} color={accent} />}
                {message.tone === "success" &&
                  (message.celebrate ? (
                    <CapGlyph size={18} color={dark ? "#FFFFFF" : "#1A237E"} />
                  ) : (
                    <CheckGlyph size={16} color={accent} />
                  ))}
                {isError && <Icon name="alert" size={16} />}
                {message.tone === "info" && <Icon name="info" size={16} />}
              </span>
              <div className="min-w-0 flex-1 py-0.5">
                <p className={`text-sm leading-snug ${message.detail ? "font-semibold" : "font-medium"}`}>
                  {message.text}
                </p>
                {message.detail && (
                  <p className={`mt-0.5 line-clamp-3 text-xs leading-snug ${dark ? "text-white/75" : "text-slate-600"}`}>
                    {message.detail}
                  </p>
                )}
                {message.action && (
                  <button
                    type="button"
                    onClick={() => {
                      message.action?.onClick();
                      dismissToast(message.id);
                    }}
                    className="mt-1.5 rounded text-sm font-semibold underline-offset-2 hover:underline"
                    style={{ color: accent }}
                  >
                    {message.action.label}
                  </button>
                )}
              </div>
              {message.tone !== "working" && (
                <button
                  type="button"
                  aria-label="Dismiss message"
                  onClick={() => dismissToast(message.id)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    dark
                      ? "text-white/70 hover:bg-white/10 hover:text-white"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
            {message.lifetime > 0 && (
              <span
                // Re-keyed so the bar restarts when a working toast becomes its outcome.
                key={`${message.tone}-${message.lifetime}`}
                aria-hidden="true"
                className="inb-countdown absolute bottom-0 left-0 h-0.5 w-full opacity-60"
                style={{ background: accent, animationDuration: `${message.lifetime}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
