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
      address_line_2 TEXT,
      city TEXT,
      province TEXT,
      postal_code TEXT,
      billing_same_as_shipping BOOLEAN NOT NULL DEFAULT TRUE,
      billing_address_line_1 TEXT,
      billing_address_line_2 TEXT,
      billing_city TEXT,
      billing_province TEXT,
      billing_postal_code TEXT,
      cardholder_name TEXT,
      card_last_four TEXT,
      card_expiry_month INTEGER,
      card_expiry_year INTEGER,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
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
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS address_line_2 TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS city TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS province TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_same_as_shipping BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_address_line_1 TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_address_line_2 TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_city TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_province TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS billing_postal_code TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS cardholder_name TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS card_last_four TEXT`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS card_expiry_month INTEGER`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS card_expiry_year INTEGER`;
  await sql`ALTER TABLE service_profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS amazon_profile_secrets (
      discord_user_id TEXT NOT NULL,
      retailer TEXT NOT NULL CHECK (retailer = 'amazon'),
      account_password_encrypted TEXT NOT NULL,
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
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  billing_same_as_shipping: boolean;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
  cardholder_name: string | null;
  card_last_four: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  two_factor_enabled: boolean;
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
           phone, shipping_address, address_line_2, city, province, postal_code,
           billing_same_as_shipping, billing_address_line_1, billing_address_line_2,
           billing_city, billing_province, billing_postal_code, cardholder_name,
           card_last_four, card_expiry_month, card_expiry_year, two_factor_enabled,
           payment_method, target_quantity,
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
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  billingSameAsShipping: boolean;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingProvince: string;
  billingPostalCode: string;
  cardholderName: string;
  cardLastFour: string;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  twoFactorEnabled: boolean;
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
      address_line_2, province, postal_code, billing_same_as_shipping,
      billing_address_line_1, billing_address_line_2, billing_city,
      billing_province, billing_postal_code, cardholder_name, card_last_four,
      card_expiry_month, card_expiry_year, two_factor_enabled, payment_method, target_quantity,
      product_preferences, notes
    ) VALUES (
      ${input.discordUserId}, ${input.discordName}, ${input.contactEmail},
      ${input.retailer}, ${input.serviceType}, ${input.accountEmail},
      ${input.firstName}, ${input.lastName}, ${input.phone}, ${input.shippingAddress},
      ${input.city}, ${input.addressLine2}, ${input.province}, ${input.postalCode},
      ${input.billingSameAsShipping}, ${input.billingAddressLine1},
      ${input.billingAddressLine2}, ${input.billingCity}, ${input.billingProvince},
      ${input.billingPostalCode}, ${input.cardholderName}, ${input.cardLastFour},
      ${input.cardExpiryMonth}, ${input.cardExpiryYear}, ${input.twoFactorEnabled},
      ${input.paymentMethod}, ${input.targetQuantity},
      ${input.productPreferences}, ${input.notes}
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
      address_line_2 = EXCLUDED.address_line_2,
      city = EXCLUDED.city,
      province = EXCLUDED.province,
      postal_code = EXCLUDED.postal_code,
      billing_same_as_shipping = EXCLUDED.billing_same_as_shipping,
      billing_address_line_1 = EXCLUDED.billing_address_line_1,
      billing_address_line_2 = EXCLUDED.billing_address_line_2,
      billing_city = EXCLUDED.billing_city,
      billing_province = EXCLUDED.billing_province,
      billing_postal_code = EXCLUDED.billing_postal_code,
      cardholder_name = EXCLUDED.cardholder_name,
      card_last_four = EXCLUDED.card_last_four,
      card_expiry_month = EXCLUDED.card_expiry_month,
      card_expiry_year = EXCLUDED.card_expiry_year,
      two_factor_enabled = EXCLUDED.two_factor_enabled,
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
  if (input.retailer === "amazon" && input.appPassword) {
    const encrypted = encryptAppPassword(input.appPassword);
    const secretQuery = sql`
      INSERT INTO amazon_profile_secrets (
        discord_user_id, retailer, account_password_encrypted
      ) VALUES (
        ${input.discordUserId}, 'amazon', ${encrypted}
      )
      ON CONFLICT (discord_user_id, retailer) DO UPDATE SET
        account_password_encrypted = EXCLUDED.account_password_encrypted,
        updated_at = NOW()
    `;
    await sql.transaction([profileQuery, secretQuery]);
    return;
  }
  await profileQuery;
}
