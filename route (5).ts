import { auth } from "@/auth";
import { listCheckouts } from "@/lib/checkouts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const publicFeed = new URL(request.url).searchParams.get("public") === "1";
  const session = publicFeed ? null : await auth();
  if (!publicFeed && !session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ items: await listCheckouts(publicFeed ? undefined : session!.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Checkout feed temporarily unavailable" }, { status: 503 });
  }
}
