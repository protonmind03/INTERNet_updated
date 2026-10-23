import { createContext, useContext } from "react";

/*
| True while the side menu is open with its labels (a computer, or a tablet
| with the menu opened). The menu then lists a page's sections itself, so
| the page does not draw the same sections again as tabs; on a phone or
| with the menu closed to a rail, the page's tabs show.
*/
export const SideMenuOpen = createContext(false);

export const useSectionsInMenu = () => useContext(SideMenuOpen);
