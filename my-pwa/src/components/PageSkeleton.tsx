import { Skeleton } from "./ui";

/**
 * A first page's shape while its file is still on its way (Iteration 14,
 * prototype P2): a title, four figures and a list, all empty. Shown by
 * App.tsx in place of a spinner on the three pages people land on after
 * signing in; the page itself then draws its own placeholders in the same
 * places and fills them in.
 */
export default function PageSkeleton() {
  return (
    <div
      className="app-canvas min-h-[calc(100dvh-var(--inb-top-inset))] px-4 py-5 md:px-8 md:py-6"
      role="status"
      aria-busy="true"
      aria-label="Opening your page"
    >
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="h-[106px] rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-3 h-7 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <Skeleton className="h-4 w-48" />
          <div className="mt-4 space-y-4">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
