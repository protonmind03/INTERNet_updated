import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Card, CardHeader } from "../../components/ui";
import { coordinatorRequest } from "./request";

type Alert = {
  key: string;
  title: string;
  link: string;
  items: { label: string; detail: string; link?: string }[];
};

/** How many of a kind are listed before "and N more". */
const SHOWN = 4;

/**
 * What the coordinator should not have to go looking for: supervisors
 * sitting on reviews, agreements about to end, students who stopped
 * turning up, and students at risk of finishing late. Shown only when
 * there is something to show.
 */
export default function AlertsCard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let active = true;
    coordinatorRequest<{ alerts: Alert[] }>("/api/coordinator/alerts")
      .then((data) => {
        if (active) setAlerts(data.alerts || []);
      })
      // Extra to the dashboard: a failure here is not shown.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Alerts" description="Worked out from the records, as of now" />
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {alerts.map((alert) => (
          <li key={alert.key} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon name="alert" size={16} className="shrink-0 text-amber-600" />
                {alert.title}
                <span className="tabular rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {alert.items.length}
                </span>
              </p>
              <Link
                to={alert.link}
                className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
              >
                Open
                <Icon name="chevron-right" size={14} />
              </Link>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {alert.items.slice(0, SHOWN).map((item) => (
                <li key={`${item.label}-${item.detail}`} className="text-slate-600">
                  {item.link ? (
                    <Link to={item.link} className="font-medium text-slate-900 hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{item.label}</span>
                  )}
                  : {item.detail}
                </li>
              ))}
              {alert.items.length > SHOWN && (
                <li className="text-slate-500">and {alert.items.length - SHOWN} more</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
