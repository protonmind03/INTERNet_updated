import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Card, Modal } from "../../components/ui";
import { useMediaQuery } from "../../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S PROFILE, GROUPED
|--------------------------------------------------------------------------
|
| Iteration 21. On a phone, a settings-style list: one row per group with a
| short hint (and "Missing" when something is not filled in); a tap opens
| the group in a sheet. On a wider screen, two columns: a sticky index of
| the groups, and the groups themselves. ?group=<id> opens or scrolls to
| one (a notification's "View supervisor contact" uses ?group=placement).
| The forms inside are the ones the page always had.
|
*/

export type ProfileGroup = { id: string; title: string; hint: string; missing?: boolean; content: ReactNode };

export default function ProfileGroups({ groups, onSignOut }: { groups: ProfileGroup[]; onSignOut: () => void }) {
  const phone = useMediaQuery("(max-width: 767px)");
  const [params, setParams] = useSearchParams();
  const asked = params.get("group");
  const [open, setOpen] = useState<string | null>(phone && asked ? asked : null);

  // Desktop: bring the asked-for group into view.
  useEffect(() => {
    if (phone || !asked) return;
    const frame = requestAnimationFrame(() => document.getElementById(`group-${asked}`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [phone, asked]);

  const close = () => {
    setOpen(null);
    if (asked) setParams((current) => {
      current.delete("group");
      return current;
    }, { replace: true });
  };

  if (phone) {
    const shown = groups.find((group) => group.id === open);
    return (
      <>
        <Card>
          <ul className="divide-y divide-slate-100" aria-label="Profile">
            {groups.map((group) => (
              <li key={group.id}>
                <button type="button" onClick={() => setOpen(group.id)} aria-haspopup="dialog" className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{group.title}</span>
                    <span className={`block truncate text-sm ${group.missing ? "font-semibold text-red-700" : "text-slate-600"}`}>{group.hint}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="shrink-0 text-slate-500" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <button type="button" onClick={onSignOut} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-700">
          <Icon name="logout" size={16} />
          Sign out
        </button>
        <Modal open={Boolean(shown)} onClose={close} title={shown?.title ?? ""} size="lg">
          <div className="space-y-4">{shown?.content}</div>
        </Modal>
      </>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Profile sections" className="self-start md:sticky md:top-4">
        <ul className="space-y-0.5">
          {groups.map((group) => (
            <li key={group.id}>
              <a href={`#group-${group.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-white hover:text-slate-900">
                {group.title}
                {group.missing && <span className="status-chip status-chip--late min-h-5 px-2 text-[11px]">Missing</span>}
              </a>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onSignOut} className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </nav>
      <div className="min-w-0 space-y-8">
        {groups.map((group) => (
          <section key={group.id} id={`group-${group.id}`} aria-labelledby={`group-${group.id}-title`} className="scroll-mt-4 space-y-4">
            <h2 id={`group-${group.id}-title`} className="text-base font-semibold text-slate-900">
              {group.title}
            </h2>
            {group.content}
          </section>
        ))}
      </div>
    </div>
  );
}

/** A small ring: how much of the profile is filled in. */
export function CompletionRing({ done, total }: { done: number; total: number }) {
  const share = total > 0 ? done / total : 0;
  const circumference = 2 * Math.PI * 16;
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0" role="img" aria-label={`Profile ${done} of ${total} filled in`}>
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" className="ring-track" />
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" className="ring-verified" strokeDasharray={`${share * circumference} ${circumference}`} strokeLinecap="round" />
      </svg>
      <span aria-hidden="true" className="tabular absolute inset-0 grid place-items-center text-[11px] font-bold text-slate-800">
        {done}/{total}
      </span>
    </span>
  );
}
