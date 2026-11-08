import type { ReactNode, SVGProps } from "react";

/*
|--------------------------------------------------------------------------
| ICONS
|--------------------------------------------------------------------------
|
| One icon set for the whole app, so every portal draws the same glyph for
| the same idea.
|
| change1108: a duotone set of INTERNet's own. Each glyph is a rounded
| outline (1.75 stroke, round joins) plus, for most, one filled shape that
| carries the idea: the clock's elapsed wedge, the calendar's header band,
| the house's door, the report's stamp corner, the folder's tab, the
| camera's lens. The shape is a soft tint of the icon's colour; on the
| current page (aria-current="page") or inside .ic-lit it takes the
| portal's accent (amber; mint for the supervisor) at full strength, so the
| place you are lights up (brand/brand.css, "ic-accent").
|
*/

/** A glyph: its lines, and the one shape filled behind them (the duotone accent), when it has one. */
type Glyph = ReactNode | { a: ReactNode; l: ReactNode };

const PATHS = {
  home: { a: <path d="M9 21v-6h6v6Z" />, l: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /> },
  clock: { a: <path d="M12 12V3a9 9 0 0 1 7.8 13.5Z" />, l: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ) },
  tasks: { a: <rect x="4" y="3" width="16" height="18" rx="2" />, l: (
    <>
      <path d="m9 11 3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
    </>
  ) },
  calendar: { a: <path d="M3 6.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V10H3Z" />, l: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </>
  ) },
  document: { a: <path d="M14 2.5v6h6Z" />, l: (
    <>
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11Z" />
      <path d="M14 2.5v6h6M8 13h8M8 17h5" />
    </>
  ) },
  star: { a: <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />, l: (
    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />
  ) },
  flag: { a: <path d="M5 4h13l-3 4 3 4H5Z" />, l: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </>
  ) },
  bell: { a: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" />, l: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ) },
  user: { a: <circle cx="12" cy="8" r="4" />, l: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6" />
    </>
  ) },
  users: { a: <circle cx="9" cy="8" r="3.5" />, l: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c1-3.4 3.8-5 7-5s6 1.6 7 5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 15.3c1.8.7 3 2.2 3.5 4.7" />
    </>
  ) },
  logout: { a: <path d="M3 5a2 2 0 0 1 2-2h4v18H5a2 2 0 0 1-2-2Z" />, l: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ) },
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  "check-circle": { a: <circle cx="12" cy="12" r="9" />, l: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </>
  ) },
  alert: { a: <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />, l: (
    <>
      <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </>
  ) },
  info: { a: <circle cx="12" cy="12" r="9" />, l: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5h.01" />
    </>
  ) },
  camera: { a: <circle cx="12" cy="13" r="3.5" />, l: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ) },
  coffee: { a: <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />, l: (
    <>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2.5M12 3v2.5" />
    </>
  ) },
  play: { a: <path d="M7 4.5v15l12-7.5Z" />, l: <path d="M7 4.5v15l12-7.5Z" /> },
  stop: { a: <rect x="6" y="6" width="12" height="12" rx="1.5" />, l: <rect x="6" y="6" width="12" height="12" rx="1.5" /> },
  search: { a: <circle cx="11" cy="11" r="7" />, l: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.4-4.4" />
    </>
  ) },
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: { a: <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3Z" />, l: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ) },
  download: { a: <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3Z" />, l: (
    <>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ) },
  building: { a: <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16Z" />, l: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2.5 21h19" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </>
  ) },
  image: { a: <path d="m21 15-5-5L5 20h14a2 2 0 0 0 2-2Z" />, l: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ) },
  note: { a: <path d="M5 4h14v11l-5 5H5Z" />, l: (
    <>
      <path d="M5 4h14v11l-5 5H5Z" />
      <path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4" />
    </>
  ) },
  filter: { a: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" />, l: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" /> },
  grid: { a: <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />, l: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ) },
  activity: { a: <circle cx="14.5" cy="5" r="2" />, l: <path d="M3 12h4l2.5 7 5-14 2.5 7h4" /> },
  megaphone: { a: <path d="M15 5v14l-8-4V9Z" />, l: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M18.5 9.5a3.5 3.5 0 0 1 0 5M8 15.5V19a1 1 0 0 0 1 1h1.5" />
    </>
  ) },
  chart: { a: <rect x="8.5" y="4" width="3" height="16" rx="1" />, l: <path d="M4 20V11M10 20V4M16 20v-7M21.5 20h-19" /> },
  // System pass: glyphs for figures and summaries.
  hourglass: { a: <path d="M8 20.5h8L12 15.5Z" />, l: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /> },
  inbox: { a: <path d="M3 13h5l1.5 3h5l1.5-3h5v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />, l: (
    <>
      <path d="M3 13h5l1.5 3h5l1.5-3h5" />
      <path d="M5.5 5h13l2.5 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" />
    </>
  ) },
  layers: { a: <path d="m12 3 9 5-9 5-9-5Z" />, l: (
    <>
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ) },
  shield: { a: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z" />, l: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z" /> },
  pie: { a: <path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" />, l: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9Z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" />
    </>
  ) },
  "trend-up": { a: <path d="m3 17 6-6 4 4 8-8v14H3Z" />, l: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" /> },
  "map-pin": { a: <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />, l: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ) },
  list: { a: <rect x="3" y="4.5" width="3" height="3" rx="1" />, l: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
  briefcase: { a: <path d="M3 13h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, l: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ) },
  clipboard: { a: <path d="M9 3h6v3H9Z" />, l: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 11h6M9 15h4" />
    </>
  ) },
  edit: { a: <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />, l: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ) },
  trash: { a: <path d="M6 7h12l-1 13H7Z" />, l: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ) },
  printer: { a: <rect x="7" y="14" width="10" height="7" rx="1" />, l: (
    <>
      <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="7" rx="1" />
    </>
  ) },
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.3L3 9.5" />
      <path d="M3 4.5v5h5M4 13a8 8 0 0 0 14.3 4.3l2.7-2.8" />
      <path d="M21 19.5v-5h-5" />
    </>
  ),
  mail: { a: <path d="m3.5 7.5 8.5 6 8.5-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" />, l: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ) },
  lock: { a: <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />, l: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ) },
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  phone: { a: <path d="M6.5 3h3l1.5 4.5-2 1.2a11 11 0 0 0 6.3 6.3l1.2-2 4.5 1.5v3a2 2 0 0 1-2 2A17.5 17.5 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />, l: (
    <path d="M6.5 3h3l1.5 4.5-2 1.2a11 11 0 0 0 6.3 6.3l1.2-2 4.5 1.5v3a2 2 0 0 1-2 2A17.5 17.5 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />
  ) },
  copy: { a: <rect x="9" y="9" width="11" height="11" rx="2" />, l: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ) },
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.7 5.7 12.6 12.6" />
    </>
  ),
  sliders: { a: <circle cx="12" cy="8" r="2" />, l: (
    <>
      <path d="M6 4v6M6 14v6M12 4v2M12 10v10M18 4v10M18 18v2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="18" cy="16" r="2" />
    </>
  ) },
  cap: { a: <path d="m2 9 10-5 10 5-10 5Z" />, l: (
    <>
      <path d="m2 9 10-5 10 5-10 5Z" />
      <path d="M6 11v5c3 2 9 2 12 0v-5" />
    </>
  ) },
  heart: { a: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />, l: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /> },
  // PSU redesign: Help and Messages in the grouped More sheet and side menus.
  help: { a: <circle cx="12" cy="12" r="9" />, l: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.3M12 17.5h.01" />
    </>
  ) },
  chat: { a: <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5Z" />, l: <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5Z" /> },
  "chevrons-left": <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />,
  "chevrons-right": <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />,
  // Revisions 2026-11: the header's Scan button, the folders, the album and the narrative report.
  scan: { a: <path d="M8 9h3v3H8Z" />, l: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8 9h3v3H8zM13 9h3M13 12h1M16 12v3M8 15h5" />
    </>
  ) },
  folder: { a: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5H3Z" />, l: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /> },
  album: { a: <rect x="6.5" y="3" width="14.5" height="14.5" rx="2" />, l: (
    <>
      <rect x="6.5" y="3" width="14.5" height="14.5" rx="2" />
      <path d="M3 7v12a2 2 0 0 0 2 2h12" />
      <path d="m6.5 14 3.6-3.6a1.2 1.2 0 0 1 1.7 0l4.2 4.2M14.5 8.6h.01" />
    </>
  ) },
  book: { a: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />, l: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8.5 7.5h7M8.5 11h5" />
    </>
  ) },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof PATHS;

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
};

function glyphOf(glyph: Glyph): ReactNode {
  if (glyph && typeof glyph === "object" && "l" in glyph) {
    return (
      <>
        <g className="ic-accent" stroke="none">
          {glyph.a}
        </g>
        {glyph.l}
      </>
    );
  }
  return glyph as ReactNode;
}

export default function Icon({ name, size = 18, strokeWidth = 1.75, ...rest }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {glyphOf(PATHS[name])}
    </svg>
  );
}
