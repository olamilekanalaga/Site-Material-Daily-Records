import { LedgerApp } from "@/components/ledger-app";
export const dynamic = "force-dynamic";
export default function Page() {
  return <LedgerApp localDemo={process.env.APP_MODE === "local"} />;
}
