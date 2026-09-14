import { neon } from "@neondatabase/serverless";

let initialized = false;

function sqlClient() {
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
      target_quantity INTEGER NOT NULL DEFAULT 1 CHECK (target_quantity BETWEEN 1 AND 100),
      product_preferences TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (discord_user_id, retailer)
    )
  `;
  initialized = true;
}

export type ServiceProfile = {
  id: string;
  retailer: "amazon" | "walmart" | "pokemon-center";
  service_type: string;
  account_email: string | null;
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
    SELECT id::text, retailer, service_type, account_email, target_quantity,
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
  targetQuantity: number;
  productPreferences: string;
  notes: string;
}) {
  await ensureDatabase();
  const sql = sqlClient();
  await sql`
    INSERT INTO service_profiles (
      discord_user_id, discord_name, contact_email, retailer, service_type,
      account_email, target_quantity, product_preferences, notes
    ) VALUES (
      ${input.discordUserId}, ${input.discordName}, ${input.contactEmail},
      ${input.retailer}, ${input.serviceType}, ${input.accountEmail},
      ${input.targetQuantity}, ${input.productPreferences}, ${input.notes}
    )
    ON CONFLICT (discord_user_id, retailer) DO UPDATE SET
      discord_name = EXCLUDED.discord_name,
      contact_email = EXCLUDED.contact_email,
      service_type = EXCLUDED.service_type,
      account_email = EXCLUDED.account_email,
      target_quantity = EXCLUDED.target_quantity,
      product_preferences = EXCLUDED.product_preferences,
      notes = EXCLUDED.notes,
      status = 'submitted',
      updated_at = NOW()
  `;
}
