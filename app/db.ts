import { neon } from "@neondatabase/serverless";
import { createCipheriv, randomBytes } from "node:crypto";

let initialized = false;

export function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function ensureDatabase() {
  if (initialized) return;
  const sql = sqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS service_profiles (
      id BIGSERIAL PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_name TEXT,
      contact_email TEXT,
      retailer TEXT NOT NULL CHECK (retailer IN ('amazon', 'walmart', 'pokemon-center')),
      service_type TEXT NOT NULL,
      account_email TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      shipping_address TEXT,
      city TEXT,
      postal_code TEXT,
      payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('visa', 'mastercard', 'amex')),
      target_quantity INTEGER NOT NULL DEFAULT 1 CHECK (target_quantity BETWEEN 1 AND 100),
      product_preferences TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (discord_user_id, retailer)
    )
  `;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS first_name TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS last_name TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS city TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS payment_method TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS service_profile_secrets (
      discord_user_id TEXT NOT NULL,
      retailer TEXT NOT NULL CHECK (retailer = 'walmart'),
      app_password_encrypted TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (discord_user_id, retailer)
    )
  `;
  initialized = true;
}

function encryptAppPassword(value: string) {
  const encodedKey = process.env.PROFILE_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("PROFILE_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("PROFILE_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export type ServiceProfile = {
  id: string;
  retailer: "amazon" | "walmart" | "pokemon-center";
  service_type: string;
  account_email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  shipping_address: string | null;
  city: string | null;
  postal_code: string | null;
  payment_method: "visa" | "mastercard" | "amex" | null;
  target_quantity: number;
  product_preferences: string | null;
  notes: string | null;
  status: string;
  updated_at: string;
};

export async function getProfiles(discordUserId: string): Promise<ServiceProfile[]> {
  await ensureDatabase();
  const sql = sqlClient();
  return (await sql`
    SELECT id::text, retailer, service_type, account_email, first_name, last_name,
           phone, shipping_address, city, postal_code, payment_method, target_quantity,
           product_preferences, notes, status, updated_at::text
    FROM service_profiles
    WHERE discord_user_id = ${discordUserId}
    ORDER BY retailer
  `) as ServiceProfile[];
}

export async function upsertProfile(input: {
  discordUserId: string;
  discordName: string;
  contactEmail: string;
  retailer: ServiceProfile["retailer"];
  serviceType: string;
  accountEmail: string;
  appPassword?: string;
  firstName: string;
  lastName: string;
  phone: string;
  shippingAddress: string;
  city: string;
  postalCode: string;
  paymentMethod: "visa" | "mastercard" | "amex" | null;
  targetQuantity: number;
  productPreferences: string;
  notes: string;
}) {
  await ensureDatabase();
  const sql = sqlClient();
  const profileQuery = sql`
    INSERT INTO service_profiles (
      discord_user_id, discord_name, contact_email, retailer, service_type,
      account_email, first_name, last_name, phone, shipping_address, city,
      postal_code, payment_method, target_quantity, product_preferences, notes
    ) VALUES (
      ${input.discordUserId}, ${input.discordName}, ${input.contactEmail},
      ${input.retailer}, ${input.serviceType}, ${input.accountEmail},
      ${input.firstName}, ${input.lastName}, ${input.phone}, ${input.shippingAddress},
      ${input.city}, ${input.postalCode}, ${input.paymentMethod},
      ${input.targetQuantity}, ${input.productPreferences}, ${input.notes}
    )
    ON CONFLICT (discord_user_id, retailer) DO UPDATE SET
      discord_name = EXCLUDED.discord_name,
      contact_email = EXCLUDED.contact_email,
      service_type = EXCLUDED.service_type,
      account_email = EXCLUDED.account_email,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone,
      shipping_address = EXCLUDED.shipping_address,
      city = EXCLUDED.city,
      postal_code = EXCLUDED.postal_code,
      payment_method = EXCLUDED.payment_method,
      target_quantity = EXCLUDED.target_quantity,
      product_preferences = EXCLUDED.product_preferences,
      notes = EXCLUDED.notes,
      status = 'submitted',
      updated_at = NOW()
  `;
  if (input.retailer === "walmart" && input.appPassword) {
    const encrypted = encryptAppPassword(input.appPassword);
    const secretQuery = sql`
      INSERT INTO service_profile_secrets (
        discord_user_id, retailer, app_password_encrypted
      ) VALUES (
        ${input.discordUserId}, 'walmart', ${encrypted}
      )
      ON CONFLICT (discord_user_id, retailer) DO UPDATE SET
        app_password_encrypted = EXCLUDED.app_password_encrypted,
        updated_at = NOW()
    `;
    await sql.transaction([profileQuery, secretQuery]);
    return;
  }
  await profileQuery;
}
