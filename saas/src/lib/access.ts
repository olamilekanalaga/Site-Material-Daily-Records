import type { Role } from "./types";

export type SignInPortal = "marshal" | "supervisor";

/** Selecting an entrance never assigns or changes an account's stored role. */
export function parseSignInPortal(value: unknown): SignInPortal | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "marshal" || value === "supervisor") return value;
  throw new RangeError("Choose a valid sign-in entrance.");
}

const companyRoles: Role[] = [
  "gate",
  "supervisor",
  "site_manager",
  "project_manager",
  "commercial",
  "director",
  "company_admin",
];

export function canReadReports(role: Role): boolean {
  return companyRoles.includes(role) && role !== "gate";
}

export function canUsePortal(role: Role, portal: SignInPortal | null): boolean {
  if (!companyRoles.includes(role)) return false;
  if (portal !== null && portal !== "marshal" && portal !== "supervisor")
    return false;
  if (portal === null || role === "company_admin") return true;
  return portal === "marshal"
    ? role === "gate"
    : role === "supervisor" || role === "site_manager";
}

// Browsers cap persistent cookies. Successful session renewal extends this window.
export const rememberSeconds = 365 * 24 * 3600;

export function staffDashboard(role: Role) {
  return role === "gate" || role === "company_admin" ? "/gate" : "/records";
}
