# Carted member portal

A Vercel-ready Next.js portal with Discord OAuth and Neon Postgres-backed retailer profiles.

## What is included

- Public Discord sign-in: any Discord user can create a Carted portal session.
- Protected member dashboard with member-scoped orders, fee status, and tracking links.
- Member checkout requests are recorded first; Carted confirms item pricing and the service fee before the member pays through Stripe.
- Stripe charges the saved product price multiplied by quantity, plus the saved service fee, with signed webhook payment confirmation.
- Admin-only order management for adding and pricing member orders, setting the default CAD fee, updating tracking/status, and issuing full refunds.
- Amazon, Walmart, and Pokémon Center Canada setup forms.
- Amazon and Walmart account-generation service selection.
- Quantity and product preferences (Pokémon Center has no $50 cap).
- Secure defaults: the forms never request passwords, card data, CVV, or 2FA codes.

## Deploy on Vercel

1. Unzip this folder and push it to a new GitHub repository, or import the folder through the Vercel CLI.
2. In Vercel, create a project from that repository.
3. Open **Storage / Marketplace**, install **Neon Postgres**, and connect it to this project. Confirm Vercel created `DATABASE_URL`.
4. In the Discord Developer Portal, create or open the Carted application. Copy the numeric **Application ID** and the **Client Secret**.
5. Under **OAuth2 → General → Redirects**, add exactly:

   `https://portal.carted.ca/api/auth/callback/discord`

6. In **Vercel → Project → Settings → Environment Variables**, add these values for Production, Preview, and Development:

   - `AUTH_DISCORD_ID` = the numeric Discord Application ID (not a placeholder)
   - `AUTH_DISCORD_SECRET` = the Discord Client Secret
   - `AUTH_SECRET` = a long random secret (generate with `openssl rand -base64 32`)
   - `AUTH_URL` = `https://portal.carted.ca`
   - `AUTH_TRUST_HOST` = `true`
   - `ADMIN_DISCORD_IDS` = comma-separated Discord user IDs allowed to manage member orders and fees
   - `STRIPE_SECRET_KEY` = Stripe secret API key
   - `STRIPE_WEBHOOK_SECRET` = signing secret for the portal's Stripe webhook

7. Redeploy the project after saving the variables.
8. In Stripe, add a webhook endpoint at `https://portal.carted.ca/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Copy its signing secret to `STRIPE_WEBHOOK_SECRET` and redeploy.
9. Under **Vercel → Project → Settings → Domains**, add `portal.carted.ca`. Keep the DNS record Vercel provides at GoDaddy.

## Local development

Copy `.env.example` to `.env.local`, fill in real values, then run:

```bash
npm install
npm run dev
```

For local Discord testing, also add `http://localhost:3000/api/auth/callback/discord` as a Discord OAuth redirect and set `AUTH_URL=http://localhost:3000` locally.

## Important

Do not commit `.env.local` or paste secrets into source files. This package contains no credentials. The database table is created automatically on the first authenticated dashboard visit.

Configure `ADMIN_DISCORD_IDS` and Stripe before launch. Members can submit a checkout request even when the default fee is $0.00 CAD. The request is not charged until Carted sets or verifies its item price and service fee in the admin portal. Stripe then charges the saved item price multiplied by quantity plus the saved fee; amounts come from the database, never from a browser-submitted checkout total. Pricing edits expire any open Stripe Checkout Session. Payment status changes only after a signed Stripe webhook; admins can waive unpaid orders or issue full refunds for Stripe-paid orders. Members only see orders assigned to their Discord user ID.
