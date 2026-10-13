import { createHash } from "node:crypto";
import { getOrderForPayment, saveOrderCheckoutSession } from "./member-orders";
import { portalUrl, stripeClient, stripeWebhookSecret } from "./stripe";

export async function createOrderCheckoutUrl(orderId: string, memberId: string): Promise<string> {
  stripeWebhookSecret();
  const successUrl = portalUrl("/dashboard?view=orders&payment=success");
  const cancelUrl = portalUrl("/dashboard?view=orders&payment=cancelled");
  const order = await getOrderForPayment(orderId, memberId);
  if (!order) throw new Error("Member order was not found");
  if (order.status === "cancelled") throw new Error("This order has been cancelled");
  if (order.payment_status !== "pending") {
    throw new Error("This order does not have a fee awaiting payment");
  }
  if (order.order_value_cents === null) {
    throw new Error("Carted must confirm the product price before this order can be paid");
  }
  const totalCents = order.order_value_cents * order.quantity + order.fee_cents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 99_999_999) {
    throw new Error("This order total is outside Stripe's supported charge range");
  }

  const stripe = stripeClient();
  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
    if (existing.status === "open" && existing.url) return existing.url;
    if (existing.status === "complete") {
      throw new Error("Payment is processing. Refresh your order page before trying again");
    }
  }

  const pricingFingerprint = createHash("sha256")
    .update(`${order.product}:${order.order_value_cents}:${order.quantity}:${order.fee_cents}`)
    .digest("hex")
    .slice(0, 24);
  const retrySuffix = order.stripe_checkout_session_id
    ? `retry-${order.stripe_checkout_session_id}-${pricingFingerprint}`
    : `pricing-${pricingFingerprint}`;
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.member_email,
    client_reference_id: order.id,
    line_items: [
      ...(order.order_value_cents > 0 ? [{
        quantity: order.quantity,
        price_data: {
          currency: "cad",
          unit_amount: order.order_value_cents,
          product_data: { name: order.product.slice(0, 200) },
        },
      }] : []),
      ...(order.fee_cents > 0 ? [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: order.fee_cents,
          product_data: {
            name: "Carted checkout service fee",
            description: order.product.slice(0, 200),
          },
        },
      }] : []),
    ],
    metadata: { memberOrderId: order.id, memberId: order.member_id },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, { idempotencyKey: `carted-order-${order.id}-${retrySuffix}` });

  if (!checkout.url) throw new Error("Stripe did not return a checkout URL");
  try {
    await saveOrderCheckoutSession({
      id: order.id,
      memberId,
      sessionId: checkout.id,
      product: order.product,
      orderValueCents: order.order_value_cents,
      quantity: order.quantity,
      feeCents: order.fee_cents,
    });
  } catch (error) {
    if (checkout.status === "open") await stripe.checkout.sessions.expire(checkout.id);
    throw error;
  }
  return checkout.url;
}
