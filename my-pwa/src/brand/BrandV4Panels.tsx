import BrandLockup from "./BrandLockup";
import PsuSeal from "./PsuSeal";
import { ROLE_CHROME_DARK, ROLE_PALETTES, SEAL, STATUS_COLORS, WEEKEND_TINT, contrastRatio, paletteTextPairs } from "./tokens";

/*
| Iteration 19: two panels on /brand-preview. "Seal" shows the PSU seal's
| rules with the seal drawn by the one component that enforces them;
| "v4 palettes" shows the three role palettes side by side with the contrast
| of every text pair, as the unit test computes it.
*/

const RULES = [
  "Never recolour, crop, rotate, outline, shadow or overlay it. It is drawn as the file has it.",
  `Clear space on every side: a quarter of its diameter (${SEAL.clearSpace * 100}%).`,
  `At least ${SEAL.minPx} CSS px across on screen, ${SEAL.minPrintMm} mm in print.`,
  `On dark chrome it sits on a white disc ${Math.round(SEAL.discRatio * 100)}% of its size.`,
  "Shown on the splash, the landing page, the three sign-in doors, the first onboarding slide, the Time Record header, printed reports and Help. Not in the in-app header bar.",
];

export function SealPanel() {
  const coordinator = ROLE_PALETTES.coordinator;
  return (
    <section aria-labelledby="seal-panel" className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h2 id="seal-panel" className="text-lg font-semibold text-slate-900">
        Seal
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-end gap-6">
        {[24, 40, 64, 96].map((size) => (
          <figure key={size} className="flex flex-col items-center gap-1 text-xs text-slate-600">
            <PsuSeal size={size} />
            <figcaption>{size} px</figcaption>
          </figure>
        ))}
        <figure className="flex flex-col items-center gap-1 rounded-xl p-3 text-xs" style={{ background: coordinator.chrome, color: coordinator.onChrome }}>
          <PsuSeal size={48} onDark />
          <figcaption>On dark chrome: the white disc</figcaption>
        </figure>
      </div>
      <h3 className="mt-6 text-sm font-semibold text-slate-900">Co-brand lockup</h3>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <div className="rounded-xl p-4 ring-1 ring-slate-200">
          <BrandLockup withSeal size={22} />
        </div>
        <div className="rounded-xl p-4" style={{ background: coordinator.chrome, color: coordinator.onChrome }}>
          <BrandLockup withSeal tone="onDark" size={22} />
        </div>
      </div>
    </section>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: value }} />
      <span className="font-medium text-slate-800">{name}</span>
      <span className="ml-auto font-mono text-slate-600">{value}</span>
    </div>
  );
}

export function PalettesPanel() {
  const pairs = paletteTextPairs();
  return (
    <section aria-labelledby="palettes-panel" className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h2 id="palettes-panel" className="text-lg font-semibold text-slate-900">
        v4 palettes
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        One layer per role over the shared INTERNet navy. Text pairs need 4.5:1 (3:1 at 24 px and larger); decor is never text.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(Object.keys(ROLE_PALETTES) as Array<keyof typeof ROLE_PALETTES>).map((role) => {
          const p = ROLE_PALETTES[role];
          return (
            <article key={role} className="overflow-hidden rounded-xl ring-1 ring-slate-200" aria-label={`${p.name}, ${role}`}>
              <header className="px-4 py-3" style={{ background: p.chrome, color: p.onChrome }}>
                <p className="text-xs font-semibold uppercase tracking-wide">{role === "student" ? "Trainee" : role}</p>
                <p className="text-base font-semibold">{p.name}</p>
                <p className="text-xs">{ROLE_CHROME_DARK[role] ? "Dark chrome" : "Light chrome"}</p>
              </header>
              <div className="space-y-2 p-4" style={{ background: p.surface, color: p.ink }}>
                <button type="button" className="min-h-11 rounded-lg px-4 text-sm font-semibold" style={{ background: p.primary, color: p.onPrimary }}>
                  Primary
                </button>{" "}
                <button type="button" className="min-h-11 rounded-lg px-4 text-sm font-semibold" style={{ background: p.accent, color: p.onAccent }}>
                  Accent
                </button>
                <div className="space-y-1.5 rounded-lg bg-white p-3">
                  {(["primary", "onPrimary", "accent", "onAccent", "surface", "ink", "chrome", "onChrome", "decor"] as const).map((key) => (
                    <Swatch key={key} name={key} value={p[key]} />
                  ))}
                </div>
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Contrast of {p.name}'s text pairs</caption>
                  <tbody>
                    {pairs
                      .filter((pair) => pair.role === role)
                      .map((pair) => (
                        <tr key={pair.pair}>
                          <th scope="row" className="py-0.5 pr-2 font-medium">
                            {pair.pair}
                          </th>
                          <td className="py-0.5 text-right font-mono">{contrastRatio(pair.text, pair.background).toFixed(2)}:1</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
      <h3 className="mt-6 text-sm font-semibold text-slate-900">Status colours (every role)</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(STATUS_COLORS) as Array<keyof typeof STATUS_COLORS>).map((status) => (
          <span
            key={status}
            className="inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold"
            style={{ background: STATUS_COLORS[status].bg, color: STATUS_COLORS[status].ink }}
          >
            {status} {contrastRatio(STATUS_COLORS[status].ink, STATUS_COLORS[status].bg).toFixed(2)}:1
          </span>
        ))}
        <span className="inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold ring-1 ring-slate-200" style={{ background: WEEKEND_TINT, color: STATUS_COLORS.late.ink }}>
          weekend tint, late ink {contrastRatio(STATUS_COLORS.late.ink, WEEKEND_TINT).toFixed(2)}:1
        </span>
      </div>
    </section>
  );
}
