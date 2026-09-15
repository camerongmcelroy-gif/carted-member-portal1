import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfiles, type ServiceProfile } from "@/lib/db";
import { disconnectDiscord, saveServiceProfile } from "../actions";
import LiveCheckouts from "../components/live-checkouts";
import { listCheckouts } from "@/lib/checkouts";

const retailers = [
  { id: "amazon", name: "Amazon", eyebrow: "AMAZON CA", description: "Checkout assistance and account setup preferences." },
  { id: "walmart", name: "Walmart", eyebrow: "WALMART CA", description: "Configure product targets, quantities, and notes." },
  { id: "pokemon-center", name: "Pokémon Center", eyebrow: "POKÉMON CENTER CA", description: "Submit product preferences with no artificial price cap." },
] as const;

type SearchParams = Promise<{ saved?: string; error?: string; view?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [profiles, params] = await Promise.all([getProfiles(session.user.id), searchParams]);
  const profilesByRetailer = new Map(profiles.map((profile) => [profile.retailer, profile]));
  const view = params.view === "profiles" ? "profiles" : params.view === "checkouts" ? "checkouts" : "overview";
  let feedUnavailable = false;
  const checkouts = view !== "profiles" ? await listCheckouts(session.user.id).catch(() => { feedUnavailable = true; return []; }) : [];

  return <div className="portal-layout"><aside className="sidebar"><a className="sidebar-brand" href="/dashboard"><Image src="/carted-logo.png" alt="" width={48} height={48} /><strong>Carted<span>MEMBER PORTAL</span></strong></a><p className="nav-label">WORKSPACE</p><nav aria-label="Member navigation">{[["overview", "Overview"], ["checkouts", "My checkouts"], ["profiles", "Retailer profiles"]].map(([key, label]) => <a key={key} href={`/dashboard?view=${key}`} aria-current={view === key ? "page" : undefined}><span aria-hidden="true">{key === "overview" ? "◈" : key === "checkouts" ? "▦" : "☷"}</span>{label}</a>)}</nav><div className="sidebar-note"><span className="kicker">PAY AFTER SUCCESS</span><h3>Secured first.<br />Paid after.</h3><p>No service cost until your product is secured.</p></div><a className="site-link" href="https://carted.ca">Back to Carted ↗</a></aside><main className="dashboard-shell">
    <header className="topbar">
      <a className="brand-lockup compact" href="https://carted.ca">
        <Image src="/carted-logo.png" alt="Carted" width={48} height={48} priority />
        <div><span>MEMBER PORTAL</span><strong>Carted</strong></div>
      </a>
      <div className="member-menu">
        {session.user.image ? <Image className="avatar" src={session.user.image} alt="" width={38} height={38} unoptimized /> : null}
        <div><strong>{session.user.name ?? "Discord member"}</strong><span>Discord connected</span></div>
        <form action={disconnectDiscord}><button className="text-button" type="submit">Sign out</button></form>
      </div>
    </header>

    <section className="hero-panel">
      <div><span className="kicker">YOUR CARTED WORKSPACE</span><h1>{view === "profiles" ? "Ready for your next drop." : view === "checkouts" ? "Every checkout. One place." : "Good to have you back."}</h1><p>{view === "profiles" ? "Keep your retailer preferences organised and up to date." : "Your profiles, product targets and checkout activity, all together."}</p><a className="hero-action" href={view === "profiles" ? "/dashboard?view=checkouts" : "/dashboard?view=profiles"}>{view === "profiles" ? "View my checkouts" : "Manage retailer profiles"} <span aria-hidden="true">→</span></a></div>
      <div className="discord-status"><span className="status-dot" />Discord linked</div>
    </section>

    {params.saved ? <p className="notice success">Your {retailerLabel(params.saved)} setup was saved.</p> : null}
    {params.error ? <p className="notice error">That submission could not be saved. Please try again.</p> : null}

    {view === "overview" ? <section className="overview-grid" aria-label="Account overview">
      <article><span>ACTIVE PROFILES</span><strong>{profiles.length} / 3</strong><p>Retailer service forms completed</p></article>
      <article><span>BILLING MODEL</span><strong>PAS</strong><p>Pay only after a product is secured</p></article>
      <article><span>DISCORD</span><strong>Connected</strong><p>Updates stay tied to your member identity</p></article>
    </section> : null}

    {view !== "profiles" ? feedUnavailable ? <section className="panel empty-state"><h2>Checkout feed unavailable</h2><p>Your retailer profiles are still available. The checkout database could not be reached; please try again shortly.</p></section> : <LiveCheckouts initial={checkouts} /> : <><section className="section-heading"><div><span className="kicker">SERVICE INFORMATION</span><h2>Retailer profiles</h2></div><p>Do not enter passwords, payment card numbers, CVV codes, or two-factor authentication codes.</p></section>

    <div className="retailer-grid">
      {retailers.map((retailer) => <RetailerForm key={retailer.id} retailer={retailer} profile={profilesByRetailer.get(retailer.id)} />)}
    </div></>}

    <footer><span>© 2026 Carted</span><span>Member information is used only to provide requested services.</span></footer>
  </main></div>;
}

function retailerLabel(value: string) {
  return retailers.find((retailer) => retailer.id === value)?.name ?? "retailer";
}

function RetailerForm({ retailer, profile }: { retailer: typeof retailers[number]; profile?: ServiceProfile }) {
  return <article className="retailer-card">
    <div className="retailer-head"><div><span>{retailer.eyebrow}</span><h3>{retailer.name}</h3></div><span className={`profile-badge ${profile ? "ready" : ""}`}>{profile ? profile.status : "Not set up"}</span></div>
    <p>{retailer.description}</p>
    <details><summary>{profile ? "Edit preferences" : "Set up profile"}</summary><form action={saveServiceProfile}>
      <input type="hidden" name="retailer" value={retailer.id} />
      <label>Service type<select name="serviceType" defaultValue={profile?.service_type ?? "checkout"}><option value="checkout">Checkout assistance</option>{retailer.id !== "pokemon-center" ? <option value="account-generation">Account generation</option> : null}<option value="both">Both services</option></select></label>
      <label>Retailer account email<input name="accountEmail" type="email" autoComplete="email" defaultValue={profile?.account_email ?? ""} placeholder="name@example.com" /></label>
      <label>Target quantity<input name="targetQuantity" type="number" min="1" max="100" defaultValue={profile?.target_quantity ?? 1} required /></label>
      <label>Product preferences<textarea name="productPreferences" maxLength={500} defaultValue={profile?.product_preferences ?? ""} placeholder="Products, sizes, colours, or acceptable alternatives" /></label>
      <label>Additional notes<textarea name="notes" maxLength={1000} defaultValue={profile?.notes ?? ""} placeholder="Optional instructions—never include passwords or payment details" /></label>
      <button className="save-button" type="submit">{profile ? "Update setup" : "Save setup"}</button>
      {profile ? <small>Last updated {new Date(profile.updated_at).toLocaleDateString("en-CA")}</small> : null}
    </form></details>
  </article>;
}
