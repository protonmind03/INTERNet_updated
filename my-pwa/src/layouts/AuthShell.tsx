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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md animate-page-in">
        <div className="mb-6">
          <BrandLockup size={24} tagline={null} />
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-600">{description}</p>
          {children}
        </section>
      </div>
    </main>
  );
}
