import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listCheckouts } from "@/lib/checkouts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const publicFeed = request.nextUrl.searchParams.get("public") === "1";

    if (publicFeed) {
      const items = await listCheckouts();
      return NextResponse.json(
        { items },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await listCheckouts(session.user.id);

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Checkout feed unavailable" },
      { status: 503 },
    );
  }
}
