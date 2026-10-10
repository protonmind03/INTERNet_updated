import { coordinatorRequest } from "./request";

/*
 * The names of the recorded, active companies, for the company field on the
 * student and supervisor forms. Asked for once and kept; the Companies page
 * calls forgetCompanyNames() after any change so the forms ask again.
 */

type CompanyName = { name: string; is_active: boolean };

let cached: string[] | null = null;

export function knownCompanyNames(): string[] | null {
  return cached;
}

export async function loadCompanyNames(): Promise<string[]> {
  const data = await coordinatorRequest<{ companies: CompanyName[] }>(
    "/api/coordinator/company-records"
  );
  cached = (data.companies || [])
    .filter((company) => company.is_active)
    .map((company) => company.name);
  return cached;
}

export function forgetCompanyNames(): void {
  cached = null;
}
