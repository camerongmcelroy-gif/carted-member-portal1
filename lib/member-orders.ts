import { randomUUID } from "node:crypto";
import { sqlClient } from "./db";

export type MemberOrderStatus =
  | "submitted"
  | "processing"
  | "secured"
  | "shipped"
  | "delivered"
  | "cancelled";

export type MemberPaymentStatus = "pending" | "paid" | "waived" | "refunded";

export type MemberOrder = {
  id: string;
  product: string;
  product_url: string | null;
  retailer: string;
  quantity: number;
  order_value_cents: number | null;
  fee_cents: number;
  status: MemberOrderStatus;
  payment_status: MemberPaymentStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
};
export type AdminMemberOrder = MemberOrder & { member_id: string; member_email: string };

let schema: Promise<void> | undefined;

export function ensureMemberOrders() {
  if (!schema) schema = setup().catch(error => { schema = undefined; throw error; });
  return schema;
}

async function setup() {
  const sql = sqlClient();
  await sql`CREATE TABLE IF NOT EXISTS carted_portal_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO carted_portal_settings (setting_key, setting_value, updated_by)
    VALUES ('default_fee_cents', '0', 'system')
    ON CONFLICT (setting_key) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS carted_member_orders (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    member_email TEXT NOT NULL,
    product TEXT NOT NULL,
    product_url TEXT,
    retailer TEXT NOT NULL CHECK (retailer IN ('amazon', 'walmart', 'pokemon-center')),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    order_value_cents BIGINT CHECK (order_value_cents IS NULL OR order_value_cents >= 0),
    fee_cents BIGINT NOT NULL CHECK (fee_cents >= 0),
    status TEXT NOT NULL DEFAULT 'submitted'
      CHECK (status IN ('submitted', 'processing', 'secured', 'shipped', 'delivered', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('pending', 'paid', 'waived', 'refunded')),
    tracking_number TEXT,
    tracking_url TEXT,
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE carted_member_orders
    ALTER COLUMN order_value_cents TYPE BIGINT,
    ALTER COLUMN fee_cents TYPE BIGINT`;
  await sql`ALTER TABLE carted_member_orders ADD COLUMN IF NOT EXISTS product_url TEXT`;
  await sql`ALTER TABLE carted_member_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT`;
  await sql`ALTER TABLE carted_member_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS carted_member_orders_member_created_idx
    ON carted_member_orders (member_id, created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS carted_member_orders_stripe_session_idx
    ON carted_member_orders (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS carted_member_orders_stripe_intent_idx
    ON carted_member_orders (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL`;
}

export async function listMemberOrders(memberId: string): Promise<MemberOrder[]> {
  await ensureMemberOrders();
  return await sqlClient()`SELECT id, product, retailer, quantity,
      product_url, order_value_cents::double precision AS order_value_cents,
      fee_cents::double precision AS fee_cents, status, payment_status, tracking_number, tracking_url,
      created_at::text
    FROM carted_member_orders
    WHERE member_id = ${memberId}
    ORDER BY created_at DESC
    LIMIT 100` as MemberOrder[];
}

export async function listAllMemberOrders(): Promise<AdminMemberOrder[]> {
  await ensureMemberOrders();
  return await sqlClient()`SELECT id, member_id, member_email, product, retailer, quantity,
      product_url, order_value_cents::double precision AS order_value_cents,
      fee_cents::double precision AS fee_cents, status, payment_status, tracking_number, tracking_url,
      created_at::text
    FROM carted_member_orders
    ORDER BY created_at DESC
    LIMIT 100` as AdminMemberOrder[];
}

export async function getDefaultFeeCents(): Promise<number> {
  await ensureMemberOrders();
  const rows = await sqlClient()`SELECT setting_value FROM carted_portal_settings
    WHERE setting_key = 'default_fee_cents'` as { setting_value: string }[];
  const cents = Number(rows[0]?.setting_value);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("The configured default fee is invalid");
  return cents;
}

export async function saveDefaultFeeCents(cents: number, adminId: string) {
  await ensureMemberOrders();
  await sqlClient()`INSERT INTO carted_portal_settings (setting_key, setting_value, updated_by)
    VALUES ('default_fee_cents', ${String(cents)}, ${adminId})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value,
      updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
}

export async function createMemberOrder(input: {
  memberId: string;
  memberEmail: string;
  product: string;
  productUrl: string | null;
  retailer: "amazon" | "walmart" | "pokemon-center";
  quantity: number;
  orderValueCents: number | null;
  feeCents: number;
  createdBy: string;
}) {
  await ensureMemberOrders();
  const id = randomUUID();
  await sqlClient()`INSERT INTO carted_member_orders (
      id, member_id, member_email, product, product_url, retailer, quantity, order_value_cents,
        fee_cents, payment_status, created_by
    ) VALUES (
      ${id}, ${input.memberId}, ${input.memberEmail}, ${input.product}, ${input.productUrl},
      ${input.retailer}, ${input.quantity}, ${input.orderValueCents},
        ${input.feeCents}, 'pending', ${input.createdBy}
    )`;
  return id;
}

export async function getOrderPricingDetails(id: string) {
  await ensureMemberOrders();
  const rows = await sqlClient()`SELECT payment_status, status, stripe_checkout_session_id
    FROM carted_member_orders WHERE id = ${id} LIMIT 1` as {
      payment_status: MemberPaymentStatus;
      status: MemberOrderStatus;
      stripe_checkout_session_id: string | null;
    }[];
  return rows[0] ?? null;
}

export async function updateMemberOrderPricing(input: {
  id: string;
  product: string;
  productUrl: string | null;
  retailer: "amazon" | "walmart" | "pokemon-center";
  quantity: number;
  unitPriceCents: number;
  feeCents: number;
  expectedCheckoutSessionId: string | null;
}) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders SET
      product = ${input.product}, product_url = ${input.productUrl},
      retailer = ${input.retailer}, quantity = ${input.quantity},
      order_value_cents = ${input.unitPriceCents}, fee_cents = ${input.feeCents},
      payment_status = 'pending',
      updated_at = NOW()
    WHERE id = ${input.id} AND payment_status IN ('pending', 'waived')
      AND status != 'cancelled'
      AND stripe_checkout_session_id IS NOT DISTINCT FROM ${input.expectedCheckoutSessionId}
    RETURNING id`;
  if (!rows.length) throw new Error("Member order changed or was paid while you were editing it");
}

export async function updateMemberOrder(input: {
  id: string;
  status: MemberOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
}) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders SET
      status = ${input.status}, tracking_number = ${input.trackingNumber},
      tracking_url = ${input.trackingUrl},
      updated_at = NOW()
    WHERE id = ${input.id}
    RETURNING id`;
  if (!rows.length) throw new Error("Member order was not found");
}

export async function getOrderForPayment(id: string, memberId: string) {
  await ensureMemberOrders();
  const rows = await sqlClient()`SELECT id, member_id, member_email, product,
      order_value_cents::double precision AS order_value_cents, quantity,
      fee_cents::double precision AS fee_cents, payment_status, status, stripe_checkout_session_id
    FROM carted_member_orders
    WHERE id = ${id} AND member_id = ${memberId}
    LIMIT 1` as {
      id: string;
      member_id: string;
      member_email: string;
      product: string;
      order_value_cents: number | null;
      quantity: number;
      fee_cents: number;
      payment_status: MemberPaymentStatus;
      status: MemberOrderStatus;
      stripe_checkout_session_id: string | null;
    }[];
  return rows[0] ?? null;
}

export async function saveOrderCheckoutSession(input: {
  id: string;
  memberId: string;
  sessionId: string;
  product: string;
  orderValueCents: number;
  quantity: number;
  feeCents: number;
}) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders
    SET stripe_checkout_session_id = ${input.sessionId}, updated_at = NOW()
    WHERE id = ${input.id} AND member_id = ${input.memberId}
      AND payment_status = 'pending' AND status != 'cancelled'
      AND product = ${input.product} AND order_value_cents = ${input.orderValueCents}
      AND quantity = ${input.quantity} AND fee_cents = ${input.feeCents}
    RETURNING id`;
  if (!rows.length) throw new Error("This order is no longer eligible for payment");
}

export async function markOrderPaidFromStripe(input: {
  id: string;
  memberId: string;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders
    SET payment_status = 'paid', stripe_payment_intent_id = ${input.paymentIntentId},
      updated_at = NOW()
    WHERE id = ${input.id} AND member_id = ${input.memberId}
      AND stripe_checkout_session_id = ${input.sessionId}
      AND order_value_cents IS NOT NULL
      AND fee_cents + order_value_cents * quantity = ${input.amountCents}
      AND ${input.currency} = 'cad'
      AND payment_status IN ('pending', 'paid')
    RETURNING id`;
  if (!rows.length) throw new Error("Stripe payment does not match an eligible member order");
}

export async function getOrderRefundDetails(id: string) {
  await ensureMemberOrders();
  const rows = await sqlClient()`SELECT payment_status, stripe_payment_intent_id,
      order_value_cents::double precision AS order_value_cents, quantity,
      fee_cents::double precision AS fee_cents, stripe_checkout_session_id
    FROM carted_member_orders WHERE id = ${id} LIMIT 1` as {
      payment_status: MemberPaymentStatus;
      stripe_payment_intent_id: string | null;
      order_value_cents: number | null;
      quantity: number;
      fee_cents: number;
      stripe_checkout_session_id: string | null;
    }[];
  return rows[0] ?? null;
}

export async function markOrderRefunded(id: string) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders SET
      payment_status = 'refunded', updated_at = NOW()
    WHERE id = ${id} AND payment_status IN ('paid', 'refunded')
    RETURNING id`;
  if (!rows.length) throw new Error("Only a paid order can be refunded");
}

export async function markOrderRefundedFromStripe(paymentIntentId: string, amountCents: number) {
  await ensureMemberOrders();
  await sqlClient()`UPDATE carted_member_orders SET
      payment_status = 'refunded', updated_at = NOW()
    WHERE stripe_payment_intent_id = ${paymentIntentId}
      AND order_value_cents IS NOT NULL
      AND fee_cents + order_value_cents * quantity = ${amountCents}
      AND payment_status IN ('paid', 'refunded')`;
}

export async function changeOrderPaymentStatus(
  id: string,
  paymentStatus: "pending" | "waived",
) {
  await ensureMemberOrders();
  const rows = await sqlClient()`UPDATE carted_member_orders SET
      payment_status = ${paymentStatus}, updated_at = NOW()
    WHERE id = ${id}
      AND fee_cents + COALESCE(order_value_cents, 0) * quantity > 0
      AND payment_status IN ('pending', 'waived')
    RETURNING id`;
  if (!rows.length) throw new Error("This order's payment status can no longer be changed");
}
