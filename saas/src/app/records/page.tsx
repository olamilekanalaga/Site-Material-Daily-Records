import { SimpleApp } from "@/components/delivery-log/simple-app";
import {
  localWorkspaceEnabled,
  staffRegistrationEnabled,
  workspaceEnabled,
} from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJ Civils | Delivery Records" };

export default function RecordsPage() {
  return (
    <SimpleApp
      initialPage="records"
      localDemo={localWorkspaceEnabled()}
      workspaceEnabled={workspaceEnabled()}
      registrationEnabled={staffRegistrationEnabled()}
    />
  );
}
