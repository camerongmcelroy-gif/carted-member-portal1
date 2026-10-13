"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { upsertProfile, type ServiceProfile } from "@/lib/db";
import { createMemberOrder, getDefaultFeeCents } from "@/lib/member-orders";
import { createOrderCheckoutUrl } from "@/lib/order-payment";
import { validateRetailerProductUrl, type RetailerId } from "@/lib/product-url";

export async function connectDiscord() {
  await signIn("discord", { redirectTo: "/dashboard" });
}

export async function disconnectDiscord() {
  await signOut({ redirectTo: "/" });
}

export async function requestMemberOrder(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const retailer = String(formData.get("retailer") ?? "");
  if (!["amazon", "walmart", "pokemon-center"].includes(retailer)) {
    throw new Error("Select a supported retailer");
  }
  const product = String(formData.get("product") ?? "").trim().slice(0, 200);
  const productUrl = String(formData.get("productUrl") ?? "").trim().slice(0, 1000);
  const memberEmail = String(formData.get("memberEmail") ?? "").trim().toLowerCase();
  const quantity = Number(formData.get("quantity"));
  if (!product) throw new Error("Enter the product name");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error("Quantity must be between 1 and 100");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) || memberEmail.length > 254) {
    throw new Error("Enter a valid contact email");
  }

  const safeProductUrl = validateRetailerProductUrl(productUrl, retailer as RetailerId);

  const feeCents = await getDefaultFeeCents();
  await createMemberOrder({
    memberId: session.user.id,
    memberEmail,
    product,
    productUrl: safeProductUrl,
    retailer: retailer as ServiceProfile["retailer"],
    quantity,
    orderValueCents: null,
    feeCents,
    createdBy: session.user.id,
  });
  revalidatePath("/dashboard");
  redirect("/dashboard?view=orders&request=submitted");
}

export async function payMemberOrder(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) throw new Error("Order ID is required");
  redirect(await createOrderCheckoutUrl(orderId, session.user.id));
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
  const appPassword = retailer === "walmart" || retailer === "amazon"
    ? String(formData.get("appPassword") ?? "").trim().slice(0, 200)
    : "";

  if ((retailer === "walmart" || retailer === "amazon") && !appPassword && !String(formData.get("existingProfile") ?? "")) {
    redirect(`/dashboard?view=profiles&retailer=${retailer}&error=${retailer === "amazon" ? "amazon-password" : "app-password"}`);
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
  const twoFactorEnabled = retailer === "amazon" && formData.get("twoFactorEnabled") === "yes";

  if (retailer === "amazon" && (!accountEmail || formData.get("termsAccepted") !== "on")) {
    redirect("/dashboard?view=profiles&retailer=amazon&error=amazon-details");
  }

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
    twoFactorEnabled,
    paymentMethod,
    targetQuantity,
    productPreferences: retailer === "amazon" ? String(formData.get("productPreferences") ?? "").slice(0, 500) : "",
    notes: retailer === "amazon" ? String(formData.get("notes") ?? "").slice(0, 1000) : "",
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard?saved=${retailer}`);
}
