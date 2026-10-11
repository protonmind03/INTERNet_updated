import { useCallback, useEffect, useState } from "react";
import { Card, SkeletonRows } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { errorText, toast } from "../lib/toast";

type Role = "student" | "supervisor" | "coordinator";

type Category = {
  key: string;
  label: string;
  about: string;
  has_push: boolean;
  has_email: boolean;
  push: boolean;
  email: boolean;
};

/**
 * What the signed-in person wants to be told outside the app: for each
 * kind of notification, whether it is pushed to their devices and whether
 * emails of that kind are sent. Every notification stays in the app
 * whatever is chosen here. Each switch saves as it is changed.
 */
export default function NotificationPreferences({ role }: { role: Role }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/notification-preferences`, withRoleAuth(role));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setCategories(data.categories || []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [role]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const change = async (category: Category, channel: "push" | "email", on: boolean) => {
    const key = `${category.key}-${channel}`;
    setSaving(key);
    // Shown at once; put back if the server refuses.
    setCategories((current) =>
      (current || []).map((item) => (item.key === category.key ? { ...item, [channel]: on } : item))
    );
    try {
      const response = await fetch(
        `${API_URL}/api/notification-preferences`,
        withRoleAuth(role, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: category.key, [channel]: on }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your choice could not be saved.");
    } catch (saveError) {
      setCategories((current) =>
        (current || []).map((item) => (item.key === category.key ? { ...item, [channel]: !on } : item))
      );
      toast.error(errorText(saveError, "Your choice could not be saved."));
    } finally {
      setSaving("");
    }
  };

  // A server from before this feature answers "not found": show nothing.
  if (failed) return null;

  const anyEmail = (categories || []).some((item) => item.has_email);

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
      <p className="mt-1 text-sm text-slate-600">
        Every notification is kept in the app. Choose which ones are also sent to your devices
        {anyEmail ? " or by email" : ""}.
      </p>
      {categories === null ? (
        <div className="mt-3">
          <SkeletonRows rows={3} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {categories.map((category) => (
            <li key={category.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium text-slate-900">{category.label}</p>
                <p className="text-sm text-slate-500">{category.about}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {category.has_push && (
                  <Switch
                    label="Push"
                    describes={category.label}
                    checked={category.push}
                    disabled={saving === `${category.key}-push`}
                    onChange={(on) => void change(category, "push", on)}
                  />
                )}
                {category.has_email && (
                  <Switch
                    label="Email"
                    describes={category.label}
                    checked={category.email}
                    disabled={saving === `${category.key}-email`}
                    onChange={(on) => void change(category, "email", on)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Switch({
  label,
  describes,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  describes: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        role="switch"
        aria-label={`${label} notifications for ${describes}`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-psu-700 focus:ring-psu-500"
      />
      {label}
    </label>
  );
}
