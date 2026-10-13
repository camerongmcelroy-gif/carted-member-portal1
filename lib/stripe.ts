import Stripe from "stripe";

let stripe: Stripe | undefined;

export function stripeClient(): Stripe {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripe = new Stripe(key);
  return stripe;
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return secret;
}

export function portalUrl(path: string): string {
  const baseUrl = process.env.AUTH_URL;
  if (!baseUrl) throw new Error("AUTH_URL is not configured");
  const url = new URL(baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("AUTH_URL must use HTTP or HTTPS");
  return new URL(path, url).toString();
}
