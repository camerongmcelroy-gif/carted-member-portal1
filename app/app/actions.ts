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
  const appPassword = retailer === "walmart"
    ? String(formData.get("appPassword") ?? "").trim().slice(0, 200)
    : "";

  if (retailer === "walmart" && !appPassword && !String(formData.get("existingProfile") ?? "")) {
    redirect("/dashboard?view=profiles&retailer=walmart&error=app-password");
  }
  if (appPassword && !process.env.PROFILE_ENCRYPTION_KEY) {
    redirect("/dashboard?view=profiles&retailer=walmart&error=encryption-key");
  }
  const paymentValue = retailer === "pokemon-center"
    ? String(formData.get("paymentMethod") ?? "")
    : "";
  const paymentMethod = ["visa", "mastercard", "amex"].includes(paymentValue)
    ? paymentValue as "visa" | "mastercard" | "amex"
    : null;
  const firstName = retailer === "pokemon-center" ? String(formData.get("firstName") ?? "").trim().slice(0, 100) : "";
  const lastName = retailer === "pokemon-center" ? String(formData.get("lastName") ?? "").trim().slice(0, 100) : "";
  const phone = retailer === "pokemon-center" ? String(formData.get("phone") ?? "").trim().slice(0, 30) : "";
  const shippingAddress = retailer === "pokemon-center" ? String(formData.get("shippingAddress") ?? "").trim().slice(0, 300) : "";
  const city = retailer === "pokemon-center" ? String(formData.get("city") ?? "").trim().slice(0, 120) : "";
  const postalCode = retailer === "pokemon-center" ? String(formData.get("postalCode") ?? "").trim().toUpperCase().slice(0, 20) : "";
  const accountEmail = String(formData.get("accountEmail") ?? "").trim().slice(0, 254);

  if (retailer === "pokemon-center" && !paymentMethod) {
    redirect("/dashboard?view=profiles&retailer=pokemon-center&error=payment-method");
  }
  if (retailer === "pokemon-center" && (!accountEmail || !firstName || !lastName || !shippingAddress || !city || !postalCode)) {
    redirect("/dashboard?view=profiles&retailer=pokemon-center&error=profile-details");
  }

  await upsertProfile({
    discordUserId: session.user.id,
    discordName: session.user.name ?? "Discord member",
    contactEmail: session.user.email ?? "",
    retailer: retailer as ServiceProfile["retailer"],
    serviceType: "auto-checkout",
    accountEmail,
    appPassword,
    firstName,
    lastName,
    phone,
    shippingAddress,
    city,
    postalCode,
    paymentMethod,
    targetQuantity,
    productPreferences: String(formData.get("productPreferences") ?? "").slice(0, 500),
    notes: String(formData.get("notes") ?? "").slice(0, 1000),
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard?saved=${retailer}`);
}
