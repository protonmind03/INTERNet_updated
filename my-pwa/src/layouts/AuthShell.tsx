import { useEffect, type ReactNode } from "react";
import { BrandLockup } from "../brand";

/** The centred card used by the password pages that sit outside the portals. */
export default function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  return (
    <main className="app-canvas flex min-h-[calc(100dvh-var(--inb-top-inset))] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-page-in">
        <div className="mb-6">
          <BrandLockup size={24} tagline={null} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-raised">
          {/* The brand's blue and gold, as a thin band across the top of the card. */}
          <div aria-hidden="true" className="flex h-1">
            <span className="surface-brand-bar flex-1" />
            <span className="w-16 bg-gold-400" />
          </div>
          <div className="p-6 sm:p-7">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-600">{description}</p>
            {children}
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-slate-500">
          Pangasinan State University · Lingayen Campus
        </p>
      </div>
    </main>
  );
}
