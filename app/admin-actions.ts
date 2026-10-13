"use server";
import { auth } from "@/auth";
import { isAdmin, ensureCheckouts } from "@/lib/checkouts";
import { sqlClient } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  changeOrderPaymentStatus,
  createMemberOrder,
  getOrderPricingDetails,
  getOrderRefundDetails,
  markOrderRefunded,
  saveDefaultFeeCents,
  updateMemberOrderPricing,
  updateMemberOrder,
  type MemberOrderStatus,
} from "@/lib/member-orders";
import { validateRetailerProductUrl, type RetailerId } from "@/lib/product-url";
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
  const product = String(data.get("product") ?? "").trim().slice(0, 200);
  const retailer = String(data.get("retailer") ?? "");
  const rawProductUrl = String(data.get("productUrl") ?? "").trim().slice(0, 1000);
  const quantity = Number(data.get("quantity"));
  const rawOrderValue = String(data.get("orderValue") ?? "").trim();
  if (!rawOrderValue) throw new Error("Set the product price before adding a payable order");
  const orderValueCents = parseMoneyCents(rawOrderValue, "item price");
  const feeCents = parseMoneyCents(data.get("fee"), "fee");

  if (!/^\d{17,20}$/.test(memberId)) throw new Error("Enter a valid Discord user ID");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) || memberEmail.length > 254) throw new Error("Enter a valid member email");
  if (!product) throw new Error("Enter a product name");
  if (!["amazon", "walmart", "pokemon-center"].includes(retailer)) throw new Error("Select a valid retailer");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("Quantity must be between 1 and 100");
  const productUrl = rawProductUrl ? validateRetailerProductUrl(rawProductUrl, retailer as RetailerId) : null;
  const chargeTotal = orderValueCents * quantity + feeCents;
  if (!Number.isSafeInteger(chargeTotal) || chargeTotal <= 0 || chargeTotal > 99_999_999) {
    throw new Error("The order total must be between $0.01 and $999,999.99 CAD");
  }

  await createMemberOrder({
    memberId,
    memberEmail,
    product,
    productUrl,
    retailer: retailer as "amazon" | "walmart" | "pokemon-center",
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
  const product = String(data.get("product") ?? "").trim().slice(0, 200);
  const retailer = String(data.get("retailer") ?? "");
  const rawProductUrl = String(data.get("productUrl") ?? "").trim().slice(0, 1000);
  const quantity = Number(data.get("quantity"));
  const rawUnitPrice = String(data.get("unitPrice") ?? "").trim();
  const unitPriceCents = parseMoneyCents(rawUnitPrice, "item price");
  const feeCents = parseMoneyCents(data.get("fee"), "service fee");

  if (!id) throw new Error("Order ID is required");
  if (!product) throw new Error("Enter a product name");
  if (!["amazon", "walmart", "pokemon-center"].includes(retailer)) throw new Error("Select a valid retailer");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("Quantity must be between 1 and 100");
  const productUrl = rawProductUrl ? validateRetailerProductUrl(rawProductUrl, retailer as RetailerId) : null;
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
    product,
    productUrl,
    retailer: retailer as "amazon" | "walmart" | "pokemon-center",
    quantity,
    unitPriceCents,
    feeCents,
    expectedCheckoutSessionId: current.stripe_checkout_session_id,
  });
  revalidatePath("/dashboard");
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
