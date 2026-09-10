# Carted member portal

A Vercel-ready Next.js portal with Discord OAuth and Neon Postgres-backed retailer profiles.

## What is included

- Public Discord sign-in: any Discord user can create a Carted portal session.
- Protected member dashboard.
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

7. Redeploy the project after saving the variables.
8. Under **Vercel → Project → Settings → Domains**, add `portal.carted.ca`. Keep the DNS record Vercel provides at GoDaddy.

## Local development

Copy `.env.example` to `.env.local`, fill in real values, then run:

```bash
npm install
npm run dev
```

For local Discord testing, also add `http://localhost:3000/api/auth/callback/discord` as a Discord OAuth redirect and set `AUTH_URL=http://localhost:3000` locally.

## Important

Do not commit `.env.local` or paste secrets into source files. This package contains no credentials. The database table is created automatically on the first authenticated dashboard visit.
