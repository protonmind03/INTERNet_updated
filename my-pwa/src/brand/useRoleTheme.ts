import { useEffect } from "react";
import { applyRoleTheme, type BrandRole } from "./roles";

/** Iteration 19: puts a role's palette layer on the page while this component is shown (brand.css [data-role]). */
export function useRoleTheme(role: BrandRole): void {
  useEffect(() => {
    applyRoleTheme(role);
  }, [role]);
}
