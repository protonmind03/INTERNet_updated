import { coordinatorRequest } from "./request";

/*
 * The recorded companies, for the company field on the student and
 * supervisor forms. Asked for once and kept; the Companies page calls
 * forgetCompanyNames() after any change so the forms ask again.
 * Phase 1.3: with each company's status and slots, so the student form can
 * leave out the ones that cannot take a student.
 */

export type CompanyChoice = { name: string; is_active: boolean; status?: string; slots: number | null; active_students?: number };

let cached: CompanyChoice[] | null = null;

export function knownCompanies(): CompanyChoice[] | null {
  return cached;
}

export async function loadCompanies(): Promise<CompanyChoice[]> {
  const data = await coordinatorRequest<{ companies: CompanyChoice[] }>("/api/coordinator/company-records");
  cached = (data.companies || []).filter((company) => company.is_active);
  return cached;
}

export function forgetCompanyNames(): void {
  cached = null;
}
