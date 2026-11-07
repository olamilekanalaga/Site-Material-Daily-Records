import { SimpleApp } from "@/components/delivery-log/simple-app";
import { localWorkspaceEnabled, workspaceEnabled } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJ Civils | Gate Delivery" };

export default function GatePage() {
  return (
    <SimpleApp
      portal="marshal"
      initialPage="home"
      localDemo={localWorkspaceEnabled()}
      workspaceEnabled={workspaceEnabled()}
    />
  );
}
