import { notFound } from "next/navigation";
import { SimpleApp } from "@/components/delivery-log/simple-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJ Civils | Staff sign-in" };

export default async function StaffSignInPage({
  params,
}: {
  params: Promise<{ portal: string }>;
}) {
  const { portal } = await params;
  if (portal !== "marshal" && portal !== "supervisor") notFound();
  const localDemo = process.env.APP_MODE === "local" && !process.env.VERCEL;
  const workspaceEnabled =
    localDemo ||
    (process.env.APP_MODE === "supabase" &&
      Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY));
  return (
    <SimpleApp
      portal={portal}
      localDemo={localDemo}
      workspaceEnabled={workspaceEnabled}
    />
  );
}
