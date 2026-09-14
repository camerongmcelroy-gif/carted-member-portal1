# Carted portal redesign

## Included

- Responsive dark sidebar layout with Carted branding and blue accents.
- Separate Overview, My checkouts and Retailer profiles views.
- Collapsible retailer setup forms; existing Discord sign-in and profile-saving actions retained.
- Product-image checkout cards, retailer filter, and 15-second refresh.
- Member checkout queries restricted to the authenticated Discord member ID.
- Public `/successes` page contains confirmed records only, without checkout emails or member IDs.
- Protected `/dashboard/admin` review page. Set `ADMIN_DISCORD_IDS` to your own numeric Discord user ID in Vercel to enable access. Never use a bot Application ID here.

## Not connected yet

The Discord importer, seven-day backfill, and always-on bot hosting are NOT included in this redesign release. Refreshing the feed reads Neon; it does not read Discord directly. Empty states are intentional, not example orders. No invoice or payment integrations were added. Passwords, app passwords, card data, CVVs and 2FA codes must not be submitted through these forms.

The checkout tables are created on first use alongside your existing service-profile table. No existing profile tables are deleted or replaced. Review status and member assignment are enforced on the server.

## Update your existing project

1. Download a backup of your GitHub repository before updating.
2. Unzip this archive. Open the `carted-member-portal1-main` folder.
3. Upload its contents to the ROOT of your existing repository, preserving the `app`, `lib`, `public`, and `types` folders. Do not upload only loose files or put the entire folder inside `app`.
4. Keep the existing Vercel project and domain. Keep the real `DATABASE_URL`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_SECRET`, `AUTH_URL` and `AUTH_TRUST_HOST` values already configured there. No secret values are included in this package.
5. Let Vercel build the new commit. Test Discord sign-in, saving a retailer profile and the mobile layout before promoting it to production.

The production Next.js build and TypeScript checks passed locally. Real Discord login, Neon access and authenticated visual testing require your configured deployment and have not been verified here. This archive has not been deployed.

Original duplicate uploaded files remain in the archive, but are excluded from TypeScript checking. Active routes live under `app/`.
