"use server";
import { auth } from "@/auth";
import { isAdmin, ensureCheckouts } from "@/lib/checkouts";
import { sqlClient } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  changeOrderPaymentStatus,
  createMemberOrder,
  getCatalogProduct,
  getOrderPricingDetails,
  getOrderRefundDetails,
  saveCatalogProduct,
  markOrderRefunded,
  setCatalogProductActive,
  saveDefaultFeeCents,
  updateMemberOrderPricing,
  updateMemberOrder,
  type MemberOrderStatus,
} from "@/lib/member-orders";
import { stripeClient, stripeWebhookSecret } from "@/lib/stripe";

function parseMoneyCents(value: FormDataEntryValue | null, label: string): number {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) throw new Error(`Enter a valid ${label} in CAD`);
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`Enter a valid ${label} in CAD`);
  return cents;
}

export async function addMemberOrder(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");

  const memberId = String(data.get("memberId") ?? "").trim();
  const memberEmail = String(data.get("memberEmail") ?? "").trim().toLowerCase();
  const catalogProductId = String(data.get("productId") ?? "").trim();
  const quantity = Number(data.get("quantity"));
  const rawOrderValue = String(data.get("orderValue") ?? "").trim();
  const feeCents = parseMoneyCents(data.get("fee"), "fee");

  const catalogProduct = catalogProductId ? await getCatalogProduct(catalogProductId) : null;
  if (!catalogProduct?.active) throw new Error("Select an active catalog product");
  if (!/^\d{17,20}$/.test(memberId)) throw new Error("Enter a valid Discord user ID");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) || memberEmail.length > 254) throw new Error("Enter a valid member email");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("Quantity must be between 1 and 100");
  const orderValueCents = rawOrderValue ? parseMoneyCents(rawOrderValue, "item price") : catalogProduct.unit_price_cents;
  const chargeTotal = orderValueCents * quantity + feeCents;
  if (!Number.isSafeInteger(chargeTotal) || chargeTotal <= 0 || chargeTotal > 99_999_999) {
    throw new Error("The order total must be between $0.01 and $999,999.99 CAD");
  }

  await createMemberOrder({
    memberId,
    memberEmail,
    product: catalogProduct.name,
    productUrl: null,
    catalogProductId,
    retailer: catalogProduct.retailer,
    quantity,
    orderValueCents,
    feeCents,
    createdBy: session!.user.id,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");
}

export async function updateMemberOrderPricingAction(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");

  const id = String(data.get("id") ?? "").trim();
  const catalogProductId = String(data.get("productId") ?? "").trim();
  const quantity = Number(data.get("quantity"));
  const rawUnitPrice = String(data.get("unitPrice") ?? "").trim();
  const feeCents = parseMoneyCents(data.get("fee"), "service fee");

  if (!id) throw new Error("Order ID is required");
  const catalogProduct = catalogProductId ? await getCatalogProduct(catalogProductId) : null;
  if (!catalogProduct) throw new Error("Select a valid catalog product");
  if (!catalogProduct.active) throw new Error("Activate this catalog product before assigning it");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("Quantity must be between 1 and 100");
  const unitPriceCents = rawUnitPrice ? parseMoneyCents(rawUnitPrice, "item price") : catalogProduct.unit_price_cents;
  const chargeTotal = unitPriceCents * quantity + feeCents;
  if (!Number.isSafeInteger(chargeTotal) || chargeTotal <= 0 || chargeTotal > 99_999_999) {
    throw new Error("The order total must be between $0.01 and $999,999.99 CAD");
  }

  const current = await getOrderPricingDetails(id);
  if (!current) throw new Error("Member order was not found");
  if (current.status === "cancelled") throw new Error("A cancelled order cannot be repriced");
  if (current.payment_status === "paid" || current.payment_status === "refunded") {
    throw new Error("A paid or refunded order cannot be repriced");
  }

  if (current.stripe_checkout_session_id) {
    const checkout = await stripeClient().checkout.sessions.retrieve(current.stripe_checkout_session_id);
    if (checkout.status === "complete") {
      throw new Error("This order has completed checkout. Wait for Stripe payment confirmation before editing.");
    }
    if (checkout.status === "open") {
      await stripeClient().checkout.sessions.expire(current.stripe_checkout_session_id);
    }
  }

  await updateMemberOrderPricing({
    id,
    catalogProductId,
    product: catalogProduct.name,
    productUrl: null,
    retailer: catalogProduct.retailer,
    quantity,
    unitPriceCents,
    feeCents,
    expectedCheckoutSessionId: current.stripe_checkout_session_id,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");
}

export async function saveCatalogProductAction(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");

  const id = String(data.get("id") ?? "").trim() || null;
  const name = String(data.get("name") ?? "").trim().slice(0, 200);
  const retailer = String(data.get("retailer") ?? "");
  const category = String(data.get("category") ?? "").trim().slice(0, 80);
  const unitPriceCents = parseMoneyCents(data.get("unitPrice"), "item price");
  const file = data.get("image");

  if (!name) throw new Error("Enter a product name");
  if (!["amazon", "walmart", "pokemon-center"].includes(retailer)) throw new Error("Select a valid retailer");
  let imageData: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) throw new Error("Product images must be 1 MB or smaller");
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) throw new Error("Upload a JPG, PNG, or WebP image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const matchesType = file.type === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === "image/png"
        ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
          && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!matchesType) throw new Error("The uploaded file does not match its image type");
    imageData = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  if (!id && !imageData) throw new Error("Upload an image for this product");
  await saveCatalogProduct({
    id,
    name,
    retailer: retailer as "amazon" | "walmart" | "pokemon-center",
    category,
    imageData,
    unitPriceCents,
    adminId: session!.user.id,
  });
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

export async function setCatalogProductActiveAction(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");
  const id = String(data.get("id") ?? "").trim();
  const active = String(data.get("active") ?? "") === "true";
  if (!id) throw new Error("Product ID is required");
  await setCatalogProductActive(id, active);
  revalidatePath("/dashboard/admin");
}

export async function changeDefaultMemberFee(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");
  const feeCents = parseMoneyCents(data.get("defaultFee"), "default fee");
  await saveDefaultFeeCents(feeCents, session!.user.id);
  revalidatePath("/dashboard/admin");
}

export async function updateMemberOrderAction(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");
  const id = String(data.get("id") ?? "").trim();
  const status = String(data.get("status") ?? "");
  const paymentStatus = String(data.get("paymentStatus") ?? "");
  const trackingNumber = String(data.get("trackingNumber") ?? "").trim().slice(0, 100) || null;
  const rawTrackingUrl = String(data.get("trackingUrl") ?? "").trim().slice(0, 500);
  let trackingUrl: string | null = null;
  if (rawTrackingUrl) {
    try {
      const parsed = new URL(rawTrackingUrl);
      if (parsed.protocol !== "https:") throw new Error("Tracking links must use HTTPS");
      trackingUrl = parsed.toString();
    } catch {
      throw new Error("Enter a valid HTTPS tracking link");
    }
  }
  if (!id) throw new Error("Order ID is required");
  if (!["submitted", "processing", "secured", "shipped", "delivered", "cancelled"].includes(status)) {
    throw new Error("Select a valid order status");
  }
  if (!["pending", "paid", "waived", "refunded"].includes(paymentStatus)) {
    throw new Error("Select a valid fee status");
  }

  const current = await getOrderRefundDetails(id);
  if (!current) throw new Error("Member order was not found");
  if (status === "cancelled" && current.stripe_checkout_session_id) {
    const checkout = await stripeClient().checkout.sessions.retrieve(current.stripe_checkout_session_id);
    if (checkout.status === "complete" && current.payment_status !== "paid" && current.payment_status !== "refunded") {
      throw new Error("This order has completed checkout. Wait for Stripe payment confirmation before cancelling it.");
    }
    if (checkout.status === "open") {
      await stripeClient().checkout.sessions.expire(current.stripe_checkout_session_id);
    }
  }
  if (paymentStatus === "refunded" && current.payment_status !== "refunded") {
    if (current.payment_status !== "paid" || !current.stripe_payment_intent_id) {
      throw new Error("Only Stripe-paid orders can be refunded");
    }
    stripeWebhookSecret();
    const refund = await stripeClient().refunds.create(
      { payment_intent: current.stripe_payment_intent_id },
      { idempotencyKey: `carted-order-refund-${id}` },
    );
    if (refund.status === "succeeded") await markOrderRefunded(id);
  } else if (paymentStatus === "pending" || paymentStatus === "waived") {
    if (current.payment_status === "paid" || current.payment_status === "refunded") {
      throw new Error("A completed Stripe payment cannot be changed to this status");
    }
    if (paymentStatus !== current.payment_status) await changeOrderPaymentStatus(id, paymentStatus);
  } else if (paymentStatus !== current.payment_status) {
    throw new Error("Payment status can only be confirmed by Stripe");
  }

  await updateMemberOrder({
    id,
    status: status as MemberOrderStatus,
    trackingNumber,
    trackingUrl,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");
}

export async function reviewCheckout(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");
  const id = String(data.get("id") ?? "");
  const status = String(data.get("status") ?? "");
  if (!["needs_review", "confirmed", "cancelled"].includes(status)) throw new Error("Invalid status");
  await ensureCheckouts();
  await sqlClient()`UPDATE carted_checkouts SET status = ${status}, reviewed_by = ${session!.user.id},
    reviewed_at = NOW() WHERE id = ${id}`;
  revalidatePath("/dashboard"); revalidatePath("/successes");
}

export async function assignEmail(data: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) throw new Error("Forbidden");
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const member = String(data.get("member") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !/^\d{17,20}$/.test(member)) throw new Error("Enter a valid email and Discord user ID");
  await ensureCheckouts();
  const sql = sqlClient();
  await sql.transaction([
    sql`INSERT INTO carted_email_owners (email, member_id, assigned_by) VALUES (${email},${member},${session!.user.id})
      ON CONFLICT (email) DO UPDATE SET member_id = EXCLUDED.member_id, assigned_by = EXCLUDED.assigned_by, updated_at = NOW()`,
    sql`UPDATE carted_checkouts SET member_id = ${member} WHERE checkout_email = ${email}`,
  ]);
  revalidatePath("/dashboard");
}
