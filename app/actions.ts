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
  const usesShipping = retailer === "walmart" || retailer === "pokemon-center";
  const paymentValue = usesShipping
    ? String(formData.get("paymentMethod") ?? "")
    : "";
  const paymentMethod = ["visa", "mastercard", "amex"].includes(paymentValue)
    ? paymentValue as "visa" | "mastercard" | "amex"
    : null;
  const firstName = usesShipping ? String(formData.get("firstName") ?? "").trim().slice(0, 100) : "";
  const lastName = usesShipping ? String(formData.get("lastName") ?? "").trim().slice(0, 100) : "";
  const phone = usesShipping ? String(formData.get("phone") ?? "").trim().slice(0, 30) : "";
  const shippingAddress = usesShipping ? String(formData.get("shippingAddress") ?? "").trim().slice(0, 300) : "";
  const addressLine2 = usesShipping ? String(formData.get("addressLine2") ?? "").trim().slice(0, 120) : "";
  const city = usesShipping ? String(formData.get("city") ?? "").trim().slice(0, 120) : "";
  const province = usesShipping ? String(formData.get("province") ?? "").trim().slice(0, 2) : "";
  const postalCode = usesShipping ? String(formData.get("postalCode") ?? "").trim().toUpperCase().slice(0, 20) : "";
  const billingSameAsShipping = !usesShipping || formData.get("billingSameAsShipping") === "on";
  const billingAddressLine1 = usesShipping && !billingSameAsShipping ? String(formData.get("billingAddressLine1") ?? "").trim().slice(0, 300) : "";
  const billingAddressLine2 = usesShipping && !billingSameAsShipping ? String(formData.get("billingAddressLine2") ?? "").trim().slice(0, 120) : "";
  const billingCity = usesShipping && !billingSameAsShipping ? String(formData.get("billingCity") ?? "").trim().slice(0, 120) : "";
  const billingProvince = usesShipping && !billingSameAsShipping ? String(formData.get("billingProvince") ?? "").trim().slice(0, 2) : "";
  const billingPostalCode = usesShipping && !billingSameAsShipping ? String(formData.get("billingPostalCode") ?? "").trim().toUpperCase().slice(0, 20) : "";
  const cardholderName = retailer === "walmart" ? String(formData.get("cardholderName") ?? "").trim().slice(0, 150) : "";
  const cardLastFour = retailer === "walmart" ? String(formData.get("cardLastFour") ?? "").replace(/\D/g, "").slice(-4) : "";
  const rawExpiryMonth = retailer === "walmart" ? Number(formData.get("cardExpiryMonth")) : NaN;
  const rawExpiryYear = retailer === "walmart" ? Number(formData.get("cardExpiryYear")) : NaN;
  const cardExpiryMonth = Number.isInteger(rawExpiryMonth) && rawExpiryMonth >= 1 && rawExpiryMonth <= 12 ? rawExpiryMonth : null;
  const cardExpiryYear = Number.isInteger(rawExpiryYear) && rawExpiryYear >= new Date().getFullYear() && rawExpiryYear <= new Date().getFullYear() + 20 ? rawExpiryYear : null;
  const accountEmail = String(formData.get("accountEmail") ?? "").trim().slice(0, 254);

  if (retailer === "pokemon-center" && !paymentMethod) {
    redirect("/dashboard?view=profiles&retailer=pokemon-center&error=payment-method");
  }
  if (retailer === "pokemon-center" && (!accountEmail || !firstName || !lastName || !phone || !shippingAddress || !city || !province || !postalCode)) {
    redirect("/dashboard?view=profiles&retailer=pokemon-center&error=profile-details");
  }
  if (retailer === "pokemon-center" && !billingSameAsShipping && (!billingAddressLine1 || !billingCity || !billingProvince || !billingPostalCode)) {
    redirect("/dashboard?view=profiles&retailer=pokemon-center&error=profile-details");
  }
  if (retailer === "walmart" && (!accountEmail || !cardholderName || cardLastFour.length !== 4 || !cardExpiryMonth || !cardExpiryYear || !paymentMethod || !firstName || !lastName || !phone || !shippingAddress || !city || !province || !postalCode)) {
    redirect("/dashboard?view=profiles&retailer=walmart&error=walmart-details");
  }
  if (retailer === "walmart" && !billingSameAsShipping && (!billingAddressLine1 || !billingCity || !billingProvince || !billingPostalCode)) {
    redirect("/dashboard?view=profiles&retailer=walmart&error=walmart-details");
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
    addressLine2,
    city,
    province,
    postalCode,
    billingSameAsShipping,
    billingAddressLine1,
    billingAddressLine2,
    billingCity,
    billingProvince,
    billingPostalCode,
    cardholderName,
    cardLastFour,
    cardExpiryMonth,
    cardExpiryYear,
    paymentMethod,
    targetQuantity,
    productPreferences: retailer === "amazon" ? String(formData.get("productPreferences") ?? "").slice(0, 500) : "",
    notes: retailer === "amazon" ? String(formData.get("notes") ?? "").slice(0, 1000) : "",
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard?saved=${retailer}`);
}
