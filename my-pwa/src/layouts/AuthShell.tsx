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
          <BrandLockup withSeal size={18} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-raised">
          {/* The role's own colours (the brand's blue and gold before a role is known), as a thin band. */}
          <div aria-hidden="true" className="flex h-1">
            <span className="flex-1 bg-(--role-primary)" />
            <span className="w-16 bg-(--role-accent)" />
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
