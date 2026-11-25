import { AppError } from "@/lib/server/core";
import { route } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return route(
    request,
    async () => {
      throw new AppError(403, "Delivery reviews are read-only.");
    },
    true,
  );
}
