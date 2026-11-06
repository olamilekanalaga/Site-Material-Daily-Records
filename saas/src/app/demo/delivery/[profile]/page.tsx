import { notFound } from "next/navigation";
import { DemoAccess } from "@/components/demo/demo-access";

export const metadata = { title: "DJ Civils | Record delivery demo" };

export default async function DeliveryDemoPage({
  params,
}: {
  params: Promise<{ profile: string }>;
}) {
  const { profile } = await params;
  if (profile !== "b" && profile !== "olamilekan") notFound();
  return <DemoAccess view="entry" />;
}
