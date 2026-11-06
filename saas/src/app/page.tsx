import { SimpleApp } from "@/components/delivery-log/simple-app";
export const dynamic = "force-dynamic";
export default function Page() {
  const localDemo = process.env.APP_MODE === "local" && !process.env.VERCEL;
  const workspaceEnabled =
    localDemo ||
    (process.env.APP_MODE === "supabase" &&
      Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY));
  return (
    <SimpleApp localDemo={localDemo} workspaceEnabled={workspaceEnabled} />
  );
}
