import type { ReactNode } from "react";
import { useSectionsInMenu } from "./sideMenuState";

/**
 * A page's section tabs, drawn only while the side menu is not open to
 * list the same sections (components/sideMenuState.ts); otherwise
 * `instead`. It reads the menu's state where it is drawn, inside the
 * layout, so a page can use it in what it passes to its layout.
 */
export default function UnlessInMenu({ children, instead = null }: { children: ReactNode; instead?: ReactNode }) {
  return <>{useSectionsInMenu() ? instead : children}</>;
}
