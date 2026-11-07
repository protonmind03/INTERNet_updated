import { useEffect, useState } from "react";

/*
| PSU redesign, 7 and 6W1: time-in stays phone-first. On a computer the
| trainee is shown a QR code that opens their sign-in on the phone, where
| the camera check works best. Drawn in the browser (qrcode, loaded only
| when shown). Since the November 2026 revisions it opens from the header's
| Scan button (pages/student/ScanButton.tsx) as a larger code with the
| steps; the card form is kept for any page that wants it inline.
*/

function useSignInQr(): string {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    const url = new URL("/student/sign-in", window.location.origin).href;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))
      .then((markup) => active && setSvg(markup))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return svg;
}

export default function QrHandOff({ variant = "card" }: { variant?: "card" | "large" }) {
  const svg = useSignInQr();
  if (variant === "large") {
    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <span
          className="block h-48 w-48 shrink-0 overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-(--role-hairline)"
          role="img"
          aria-label="QR code that opens INTERNet's trainee sign-in"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <ol className="min-w-0 space-y-2.5 text-[14.5px] leading-snug text-slate-700">
          {["Open your phone's camera and point it at the code.", "Tap the link that appears. INTERNet opens on your phone.", "Sign in if asked, then tap Time in. The camera check runs there."].map((line, index) => (
            <li key={line} className="flex gap-2.5">
              <span aria-hidden="true" className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-psu-100 text-[12.5px] font-bold text-psu-800">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <section className="card-hairline flex items-center gap-4 rounded-xl p-4" aria-label="Time in from your phone">
      <span className="block h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-(--role-hairline)" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-slate-900">Time in from your phone</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">The camera check works best there. Scan to open INTERNet on your phone.</span>
      </span>
    </section>
  );
}
