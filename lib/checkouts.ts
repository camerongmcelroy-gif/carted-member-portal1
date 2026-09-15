import { sqlClient } from "./db";

export type Checkout = {
  id: string; product: string; retailer: string; price_cents: number | null;
  quantity: number | null; image_url: string | null; checked_out_at: string;
  status: "needs_review" | "confirmed" | "cancelled";
};
export type AdminCheckout = Checkout & { checkout_email: string | null; member_id: string | null; warning: boolean };

export type CheckoutImport = {
  id: string;
  channelId: string;
  product: string;
  retailer: string;
  priceCents: number | null;
  quantity: number | null;
  imageUrl: string | null;
  checkoutEmail: string | null;
  checkedOutAt: string;
  warning: boolean;
};

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
    reviewed_at TIMESTAMPTZ, forwarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE carted_checkouts ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ`;
  await sql`CREATE TABLE IF NOT EXISTS carted_email_owners (
    email TEXT PRIMARY KEY, member_id TEXT NOT NULL, assigned_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS carted_sync (
    channel_id TEXT PRIMARY KEY, cutoff TIMESTAMPTZ NOT NULL, cursor_id TEXT,
    last_synced_at TIMESTAMPTZ
  )`;
}

export async function importCheckout(input: CheckoutImport) {
  await ensureCheckouts();
  const sql = sqlClient();
  const rows = await sql`INSERT INTO carted_checkouts (
      id, channel_id, product, retailer, price_cents, quantity, image_url,
      checkout_email, checked_out_at, warning, member_id
    ) VALUES (
      ${input.id}, ${input.channelId}, ${input.product}, ${input.retailer},
      ${input.priceCents}, ${input.quantity}, ${input.imageUrl},
      ${input.checkoutEmail}, ${input.checkedOutAt}, ${input.warning},
      (SELECT member_id FROM carted_email_owners WHERE email = ${input.checkoutEmail})
    )
    ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
    RETURNING id, forwarded_at::text` as { id: string; forwarded_at: string | null }[];
  return rows[0];
}

export async function markCheckoutForwarded(id: string) {
  await ensureCheckouts();
  await sqlClient()`UPDATE carted_checkouts SET forwarded_at = NOW()
    WHERE id = ${id} AND forwarded_at IS NULL`;
}
export function isAdmin(id?: string) {
  return Boolean(id && (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(id));
}
export async function listCheckouts(memberId?: string): Promise<Checkout[]> {
  await ensureCheckouts();
  const sql = sqlClient();
  if (memberId) return await sql`WITH ranked AS (
      SELECT id, product, retailer, price_cents, quantity, image_url, checked_out_at, status,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(product), LOWER(retailer), price_cents, quantity,
            LOWER(COALESCE(checkout_email, '')), DATE_TRUNC('second', checked_out_at)
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
      FROM carted_checkouts WHERE member_id = ${memberId}
    )
    SELECT id, product, retailer, price_cents, quantity, image_url,
      checked_out_at::text, status FROM ranked WHERE duplicate_rank = 1
    ORDER BY checked_out_at DESC LIMIT 100` as Checkout[];
  return await sql`WITH ranked AS (
      SELECT id, product, retailer, price_cents, quantity, image_url, checked_out_at, status,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(product), LOWER(retailer), price_cents, quantity,
            LOWER(COALESCE(checkout_email, '')), DATE_TRUNC('second', checked_out_at)
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
      FROM carted_checkouts WHERE status = 'confirmed'
    )
    SELECT id, product, retailer, price_cents, quantity, image_url,
      checked_out_at::text, status FROM ranked WHERE duplicate_rank = 1
    ORDER BY checked_out_at DESC LIMIT 100` as Checkout[];
}
export async function listAdminCheckouts(): Promise<AdminCheckout[]> {
  await ensureCheckouts();
  return await sqlClient()`WITH ranked AS (
      SELECT id, product, retailer, price_cents, quantity, image_url, checked_out_at, status,
        checkout_email, member_id, warning,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(product), LOWER(retailer), price_cents, quantity,
            LOWER(COALESCE(checkout_email, '')), DATE_TRUNC('second', checked_out_at)
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
      FROM carted_checkouts
    )
    SELECT id, product, retailer, price_cents, quantity, image_url,
      checked_out_at::text, status, checkout_email, member_id, warning
    FROM ranked WHERE duplicate_rank = 1
    ORDER BY (status = 'needs_review') DESC, checked_out_at DESC LIMIT 100` as AdminCheckout[];
}
export async function syncStatus() {
  await ensureCheckouts();
  const rows = await sqlClient()`SELECT last_synced_at::text FROM carted_sync
    WHERE channel_id = '1535102576725327901'`;
  return rows[0]?.last_synced_at as string | null | undefined;
}
