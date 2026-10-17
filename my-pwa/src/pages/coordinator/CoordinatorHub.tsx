import type { ComponentType } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { HubContext, movedTo, tabOf, type HubKey } from "./hubConfig";

/**
 * A hub's page: the old page for the tab in the address, drawn as it always
 * was. The layout reads the context and draws the hub's tabs above it.
 */
export default function CoordinatorHub({ hub, pages }: { hub: HubKey; pages: Record<string, ComponentType> }) {
  const [params] = useSearchParams();
  const tab = tabOf(hub, params);
  const Page = pages[tab];
  return (
    <HubContext.Provider value={{ hub, tab }}>
      <Page key={tab} />
    </HubContext.Provider>
  );
}

/** An old address: sent on to its tab, with what else it carried. */
export function MovedPage() {
  const { pathname, search } = useLocation();
  return <Navigate to={movedTo(pathname.replace(/\/+$/, ""), search) ?? "/coordinator/dashboard"} replace />;
}
