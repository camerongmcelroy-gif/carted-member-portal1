import { sqlClient } from "./db";

export type Checkout = {
  id: string; product: string; retailer: string; price_cents: number | null;
  quantity: number | null; image_url: string | null; checked_out_at: string;
  status: "needs_review" | "confirmed" | "cancelled";
};
export type AdminCheckout = Checkout & { checkout_email: string | null; member_id: string | null; warning: boolean };

let schema: Promise<void> | undefined;
export function ensureCheckouts() {
  if (!schema) schema = setup().catch((e) => { schema = undefined; throw e; });
  return schema;
}
async function setup() {
  const sql = sqlClient();
  await sql`CREATE TABLE IF NOT EXISTS carted_checkouts (
    id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, product TEXT NOT NULL,
    retailer TEXT NOT NULL, price_cents INTEGER, quantity INTEGER, image_url TEXT,
    checkout_email TEXT, checked_out_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','confirmed','cancelled')),
    warning BOOLEAN NOT NULL DEFAULT FALSE, member_id TEXT, reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS carted_email_owners (
    email TEXT PRIMARY KEY, member_id TEXT NOT NULL, assigned_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS carted_sync (
    channel_id TEXT PRIMARY KEY, cutoff TIMESTAMPTZ NOT NULL, cursor_id TEXT,
    last_synced_at TIMESTAMPTZ
  )`;
}
export function isAdmin(id?: string) {
  return Boolean(id && (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(id));
}
export async function listCheckouts(memberId?: string): Promise<Checkout[]> {
  await ensureCheckouts();
  const sql = sqlClient();
  if (memberId) return await sql`SELECT id, product, retailer, price_cents, quantity, image_url,
    checked_out_at::text, status FROM carted_checkouts WHERE member_id = ${memberId}
    ORDER BY checked_out_at DESC LIMIT 100` as Checkout[];
  return await sql`SELECT id, product, retailer, price_cents, quantity, image_url,
    checked_out_at::text, status FROM carted_checkouts WHERE status = 'confirmed'
    ORDER BY checked_out_at DESC LIMIT 100` as Checkout[];
}
export async function listAdminCheckouts(): Promise<AdminCheckout[]> {
  await ensureCheckouts();
  return await sqlClient()`SELECT id, product, retailer, price_cents, quantity, image_url,
    checked_out_at::text, status, checkout_email, member_id, warning FROM carted_checkouts
    ORDER BY (status = 'needs_review') DESC, checked_out_at DESC LIMIT 100` as AdminCheckout[];
}
export async function syncStatus() {
  await ensureCheckouts();
  const rows = await sqlClient()`SELECT last_synced_at::text FROM carted_sync
    WHERE channel_id = '1535102576725327901'`;
  return rows[0]?.last_synced_at as string | null | undefined;
}
