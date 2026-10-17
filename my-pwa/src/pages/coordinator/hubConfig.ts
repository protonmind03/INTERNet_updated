import { createContext, useContext } from "react";
import type { HubKey } from "./hubs";

/* The hubs themselves (which tabs, which old addresses move where) are in hubs.ts. */
export * from "./hubs";

export const HubContext = createContext<{ hub: HubKey; tab: string } | null>(null);

/** The hub the page is drawn in, if any. */
export const useHub = () => useContext(HubContext);
