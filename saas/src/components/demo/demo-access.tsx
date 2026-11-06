"use client";
import { SimpleApp } from "../delivery-log/simple-app";
export type DemoView = "marshal" | "entry" | "records" | "supervisor";

export function DemoAccess({ view = "marshal" }: { view?: DemoView }) {
  return <SimpleApp demo demoView={view} workspaceEnabled={false} />;
}
