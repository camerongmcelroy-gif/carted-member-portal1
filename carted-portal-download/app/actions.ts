"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { upsertProfile, type ServiceProfile } from "@/lib/db";

export async function connectDiscord() {
  await signIn("discord", { redirectTo: "/dashboard" });
}

export async function disconnectDiscord() {
  await signOut({ redirectTo: "/" });
}

export async function saveServiceProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const retailer = String(formData.get("retailer") ?? "");
  if (!["amazon", "walmart", "pokemon-center"].includes(retailer)) {
    redirect("/dashboard?error=retailer");
  }

  const rawQuantity = Number(formData.get("targetQuantity") ?? 1);
  const targetQuantity = Math.max(1, Math.min(100, Number.isFinite(rawQuantity) ? rawQuantity : 1));

  await upsertProfile({
    discordUserId: session.user.id,
    discordName: session.user.name ?? "Discord member",
    contactEmail: session.user.email ?? "",
    retailer: retailer as ServiceProfile["retailer"],
    serviceType: String(formData.get("serviceType") ?? "checkout").slice(0, 80),
    accountEmail: String(formData.get("accountEmail") ?? "").slice(0, 254),
    targetQuantity,
    productPreferences: String(formData.get("productPreferences") ?? "").slice(0, 500),
    notes: String(formData.get("notes") ?? "").slice(0, 1000),
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard?saved=${retailer}`);
}
