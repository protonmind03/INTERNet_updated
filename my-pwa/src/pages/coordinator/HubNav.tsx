import { Link } from "react-router-dom";
import { useSectionsInMenu } from "../../components/sideMenuState";
import { HUBS, tabPath, type HubKey } from "./hubConfig";

/**
 * A hub's tabs, as links: each tab has its own address, so it can be
 * bookmarked and the back button works. When the side menu is open it
 * already lists these pages under the hub's group, so the tabs are not
 * drawn a second time (components/sideMenuState.ts).
 */
export default function HubNav({ hub, tab }: { hub: HubKey; tab: string }) {
  const inMenu = useSectionsInMenu();
  if (inMenu) return null;
  const { title, tabs } = HUBS[hub];
  return (
    <div className="mb-5 print:hidden">
      <nav aria-label={`${title} sections`} className="u-tabs max-w-full overflow-x-auto">
        {tabs.map((item) => (
          <Link key={item.id} to={tabPath(hub, item.id)} aria-current={item.id === tab ? "page" : undefined} className="u-tab">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
