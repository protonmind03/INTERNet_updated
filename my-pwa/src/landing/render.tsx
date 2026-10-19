import { renderToStaticMarkup } from "react-dom/server";
import Landing from "./Landing";

/** The landing page as plain HTML, put into index.html when the site is built (vite.config.ts). */
export function render(): string {
  return renderToStaticMarkup(<Landing />);
}
