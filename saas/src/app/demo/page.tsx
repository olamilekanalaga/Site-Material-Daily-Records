import { LedgerApp } from "@/components/ledger-app";
export const metadata = { title: "DJCU | Interactive demo" };
export default function DemoPage() {
  return <LedgerApp demo workspaceEnabled={false} />;
}
