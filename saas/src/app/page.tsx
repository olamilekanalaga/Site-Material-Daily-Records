import { SimpleApp } from "@/components/delivery-log/simple-app";
import { localWorkspaceEnabled, workspaceEnabled } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <SimpleApp
      localDemo={localWorkspaceEnabled()}
      workspaceEnabled={workspaceEnabled()}
    />
  );
}
