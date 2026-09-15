"use server";
import { auth } from "@/auth";
import { isAdmin, ensureCheckouts } from "@/lib/checkouts";
import { sqlClient } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
