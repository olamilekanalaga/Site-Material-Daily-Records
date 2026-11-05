import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async (c) => c.bootstrap());
}
