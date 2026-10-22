import { useEffect, useState } from "react";

/*
| PSU redesign, 7 and 6W1: time-in stays phone-first. On a computer the
| trainee's Today shows a QR code that opens their sign-in on the phone,
| where the camera check works best. Drawn in the browser (qrcode, loaded
| only when shown).
*/
export default function QrHandOff() {
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
