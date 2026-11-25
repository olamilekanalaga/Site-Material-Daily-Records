import { notFound } from "next/navigation";
import { StaffRegistration } from "@/components/auth/staff-registration";
import { staffRegistrationEnabled } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJ Civils | Staff registration" };

export default function RegisterPage() {
  if (!staffRegistrationEnabled()) notFound();
  return <StaffRegistration />;
}
