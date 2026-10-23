import type { ComponentType, ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { departedTo, HubContext, movedTo, tabOf, type HubKey } from "./hubConfig";

/**
 * A hub's page: the old page for the tab in the address, drawn as it always
 * was. The layout reads the context and draws the hub's tabs above it.
 */
export default function CoordinatorHub({ hub, pages }: { hub: HubKey; pages: Record<string, ComponentType> }) {
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();
  const departed = departedTo(pathname.replace(/\/+$/, ""), search);
  if (departed) return <Navigate to={departed} replace />;
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

/** A page that was a hub's tab and is its own page now: an old tab address is sent to its new page. */
export function OwnPage({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const departed = departedTo(pathname.replace(/\/+$/, ""), search);
  return departed && departed !== `${pathname}${search}` ? <Navigate to={departed} replace /> : <>{children}</>;
}
