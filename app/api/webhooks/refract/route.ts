import { createHash, timingSafeEqual } from "node:crypto";
import { importCheckout, markCheckoutForwarded } from "@/lib/checkouts";
import { parseRefractPayload, type DiscordWebhookPayload } from "@/lib/refract";

const CHANNEL_ID = process.env.DISCORD_CHECKOUT_CHANNEL_ID ?? "1535102576725327901";
const MAX_BODY_BYTES = 1_000_000;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function checkoutId(checkout: ReturnType<typeof parseRefractPayload>[number]) {
  const orderReference = checkout.orderReference?.trim().toLowerCase();
  const identity = orderReference
    ? [CHANNEL_ID, checkout.retailer, "order", orderReference]
    : [
        CHANNEL_ID,
        checkout.retailer,
        checkout.product.trim().toLowerCase(),
        checkout.checkoutEmail ?? "",
        checkout.priceCents ?? "",
        checkout.quantity ?? "",
        checkout.checkedOutAt,
      ];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function authorized(request: Request) {
  const expected = process.env.CARTED_INGEST_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = request.headers.get("x-carted-webhook-secret")
    ?? (authorization?.startsWith("Bearer ") ? authorization.slice(7) : null)
    ?? new URL(request.url).searchParams.get("secret")
    ?? "";
  return timingSafeEqual(digest(supplied), digest(expected));
}

async function forwardToDiscord(payload: DiscordWebhookPayload) {
  const destination = process.env.DISCORD_SUCCESS_WEBHOOK_URL;
  if (!destination) return false;
  const response = await fetch(destination, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Discord forward failed with ${response.status}`);
  return true;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let payload: DiscordWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as DiscordWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseRefractPayload(payload);
  if (!parsed.length) {
    return Response.json({ error: "No successful checkout embed found" }, { status: 422 });
  }

  try {
    const records = await Promise.all(parsed.map((checkout) => {
      const { orderReference: _orderReference, ...record } = checkout;
      return importCheckout({
        id: checkoutId(checkout),
        channelId: CHANNEL_ID,
        ...record,
      });
    }));

    const needsForward = records.some((record) => record && !record.forwarded_at);
    const forwarded = needsForward ? await forwardToDiscord(payload) : false;
    if (forwarded) {
      await Promise.all(records.filter(Boolean).map((record) => markCheckoutForwarded(record!.id)));
    }

    return Response.json({ received: parsed.length, forwarded });
  } catch (error) {
    console.error("Checkout webhook ingestion failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Checkout could not be saved" }, { status: 503 });
  }
}
