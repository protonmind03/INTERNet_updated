import { renderToStaticMarkup } from "react-dom/server";
import type { DoorRole } from "./content";
import Landing from "./Landing";
import RolePage from "./RolePage";

/**
 * A public page as plain HTML, put into its .html file when the site is
 * built (vite.config.ts): the landing page, or a role's own page.
 */
export function render(page: "home" | DoorRole = "home"): string {
  return renderToStaticMarkup(page === "home" ? <Landing /> : <RolePage role={page} />);
}
