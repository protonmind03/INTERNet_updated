import { useEffect } from "react";
import { applyRoleTheme, type BrandRole } from "./roles";

/** Iteration 23: each role's installable app (public/manifest-{role}.webmanifest) and its Home Screen name. */
const ROLE_APP: Record<BrandRole, { manifest: string; title: string }> = {
  student: { manifest: "/manifest-student.webmanifest", title: "INTERNet Trainee" },
  supervisor: { manifest: "/manifest-supervisor.webmanifest", title: "INTERNet Supervisor" },
  coordinator: { manifest: "/manifest-coordinator.webmanifest", title: "INTERNet Coordinator" },
  guest: { manifest: "/manifest.json", title: "INTERNet" },
};

/**
 * Links a role's own manifest, so installing from its door or its portal
 * installs that role's app. The browser reads the manifest again when the
 * link changes.
 */
export function applyRoleManifest(role: BrandRole): void {
  if (typeof document === "undefined") return;
  const app = ROLE_APP[role];
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link && link.getAttribute("href") !== app.manifest) link.setAttribute("href", app.manifest);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", app.title);
}

/**
 * Iteration 19: puts a role's palette layer on the page while this component
 * is shown (brand.css [data-role]); Iteration 23: and links that role's app.
 */
export function useRoleTheme(role: BrandRole): void {
  useEffect(() => {
    applyRoleTheme(role);
    applyRoleManifest(role);
  }, [role]);
}
