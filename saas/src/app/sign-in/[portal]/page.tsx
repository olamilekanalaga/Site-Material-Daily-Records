import { notFound } from "next/navigation";
import { SimpleApp } from "@/components/delivery-log/simple-app";
import { localWorkspaceEnabled, workspaceEnabled } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJ Civils | Staff sign-in" };

export default async function StaffSignInPage({
  params,
}: {
  params: Promise<{ portal: string }>;
}) {
  const { portal } = await params;
  if (portal !== "marshal" && portal !== "supervisor") notFound();
  return (
    <SimpleApp
      portal={portal}
      localDemo={localWorkspaceEnabled()}
      workspaceEnabled={workspaceEnabled()}
    />
  );
}
