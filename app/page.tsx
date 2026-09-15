import "./prestige.css";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfiles, type ServiceProfile } from "@/lib/db";
import { listCheckouts, type Checkout } from "@/lib/checkouts";
import { disconnectDiscord, saveServiceProfile } from "../actions";
import LiveCheckouts, { ProductImage } from "../components/live-checkouts";

const retailers = [
  { id: "amazon", name: "Amazon", eyebrow: "AMAZON CA", description: "Checkout assistance and account setup preferences." },
  { id: "walmart", name: "Walmart", eyebrow: "WALMART CA", description: "Configure product targets, quantities, and notes." },
  { id: "pokemon-center", name: "Pokémon Center", eyebrow: "POKÉMON CENTER CA", description: "Submit product preferences with no artificial price cap." },
] as const;

type View = "home" | "wins" | "profiles" | "settings";
type SearchParams = Promise<{ saved?: string; error?: string; view?: string; retailer?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const params = await searchParams;
  const view: View = ["wins", "profiles", "settings"].includes(params.view ?? "") ? params.view as View : "home";
  const [profiles, checkoutResult] = await Promise.all([
    getProfiles(session.user.id),
    view === "profiles" ? Promise.resolve({ items: [] as Checkout[], failed: false }) : listCheckouts(session.user.id).then(items => ({ items, failed: false })).catch(() => ({ items: [] as Checkout[], failed: true })),
  ]);
  const checkouts = checkoutResult.items;
  const profilesByRetailer = new Map(profiles.map(profile => [profile.retailer, profile]));
  const selectedRetailer = retailers.find(retailer => retailer.id === params.retailer) ?? retailers[0];
  const confirmed = checkouts.filter(item => item.status === "confirmed");
  const cancelled = checkouts.filter(item => item.status === "cancelled");
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekWins = confirmed.filter(item => new Date(item.checked_out_at).getTime() >= weekCutoff);
  const weekUnits = weekWins.reduce((sum, item) => sum + (item.quantity ?? 1), 0);

  return <div className="np-shell">
    <header className="np-topbar"><a className="np-logo" href="/dashboard"><Image src="/carted-logo.png" alt="" width={38} height={38} priority /><strong>CARTED</strong></a><div className="np-member">{session.user.image ? <Image src={session.user.image} alt="" width={30} height={30} unoptimized /> : <span className="np-avatar-fallback">{(session.user.name ?? "C")[0]}</span>}<span>{session.user.name ?? "Carted member"}</span></div></header>
    <aside className="np-sidebar"><p>CARTED MEMBER PORTAL</p><nav aria-label="Member dashboard"><NavItem view="home" active={view} icon="⌂" label="HOME" /><NavItem view="wins" active={view} icon="♛" label="WINS" /><NavItem view="profiles" active={view} icon="▱" label="PROFILES" /><span className="np-nav-disabled"><i>▣</i> INVOICES <em>SOON</em></span><span className="np-nav-disabled"><i>♧</i> REFERRALS <em>SOON</em></span><NavItem view="settings" active={view} icon="☷" label="SETTINGS" /></nav><div className="np-pas"><span>PAS</span><strong>Pay after success</strong><small>No service cost until your product is secured.</small></div><a className="np-back" href="https://carted.ca">← Back to carted.ca</a></aside>
    <main className="np-main">
      {params.saved ? <p className="notice success">Your {retailerLabel(params.saved)} profile was saved.</p> : null}
      {params.error ? <p className="notice error">That submission could not be saved. Please try again.</p> : null}
      {view === "home" ? <HomeView profiles={profiles.length} confirmed={confirmed} cancelled={cancelled.length} weekWins={weekWins} weekUnits={weekUnits} feedFailed={checkoutResult.failed} /> : null}
      {view === "wins" ? <><PageTitle title="Wins" copy="Your checkout history, quantities, and order status." />{checkoutResult.failed ? <FeedError /> : <LiveCheckouts initial={checkouts} />}</> : null}
      {view === "profiles" ? <ProfilesView profiles={profilesByRetailer} selected={selectedRetailer} /> : null}
      {view === "settings" ? <SettingsView name={session.user.name} email={session.user.email} id={session.user.id} /> : null}
    </main>
  </div>;
}

function NavItem({ view, active, icon, label }: { view: View; active: View; icon: string; label: string }) { return <a href={`/dashboard?view=${view}`} aria-current={view === active ? "page" : undefined}><i aria-hidden="true">{icon}</i>{label}</a>; }
function PageTitle({ title, copy }: { title: string; copy: string }) { return <div className="np-page-title"><h1>{title}</h1><p>{copy}</p></div>; }

function HomeView({ profiles, confirmed, cancelled, weekWins, weekUnits, feedFailed }: { profiles: number; confirmed: Checkout[]; cancelled: number; weekWins: Checkout[]; weekUnits: number; feedFailed: boolean }) {
  return <><PageTitle title="Home" copy="Profiles, this week’s activity, and recent checkout wins." /><section className="np-summary"><article className="np-balance"><span className="np-card-label">● SERVICE MODEL</span><div><strong>PAS</strong><em>Pay after success</em></div><p>You are only charged after a product is secured.</p><small>✓ No upfront checkout fee</small></article><div className="np-totals"><MiniTotal tone="green" icon="✓" value={confirmed.length} label="Checkouts completed" /><MiniTotal tone="blue" icon="▱" value={`${profiles} / 3`} label="Retailer profiles active" /><MiniTotal tone="red" icon="⊘" value={cancelled} label="Cancellations logged" /></div></section><div className="np-section-line"><h2>This week’s activity</h2><span>Last 7 days</span></div><section className="np-week"><Metric icon="♛" value={weekWins.length} label="CHECKOUTS THIS WEEK" note="Confirmed in the last 7 days" /><Metric icon="▦" value={weekUnits} label="UNITS SECURED" note="Quantity across confirmed wins" /><Metric icon="▱" value={profiles} label="PROFILES READY" note="Retailer profiles completed" /></section><section className="np-lower"><article className="np-recent"><h2><span />Recent wins</h2>{feedFailed ? <FeedError /> : confirmed.length ? confirmed.slice(0, 6).map(item => <WinRow key={item.id} item={item} />) : <div className="np-empty"><strong>Your next win belongs here.</strong><p>Confirmed Discord checkouts linked to your account will appear automatically.</p></div>}</article><article className="np-side-card"><h2>Account status</h2><div className="np-status-ring">{profiles}<small>of 3 profiles</small></div><p>{profiles === 3 ? "All retailer profiles are ready." : "Complete your retailer profiles to get ready for upcoming drops."}</p><a href="/dashboard?view=profiles">Manage profiles →</a></article></section></>;
}

function MiniTotal({ tone, icon, value, label }: { tone: string; icon: string; value: string | number; label: string }) { return <article><span className={`np-total-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>; }
function Metric({ icon, value, label, note }: { icon: string; value: number; label: string; note: string }) { return <article><i>{icon}</i><strong>{value}</strong><span>{label}</span><small>{note}</small></article>; }
function WinRow({ item }: { item: Checkout }) { const price = item.price_cents == null ? "Price unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(item.price_cents / 100); return <div className="np-win"><ProductImage src={item.image_url} name={item.product} /><div><strong>{item.product}</strong><span>{item.retailer} · {price} · Qty {item.quantity ?? "—"}</span></div><time dateTime={item.checked_out_at}>{new Date(item.checked_out_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</time></div>; }
function FeedError() { return <div className="np-empty"><strong>Checkout feed unavailable.</strong><p>Your profiles are safe. Please try the feed again shortly.</p></div>; }
function SettingsView({ name, email, id }: { name?: string | null; email?: string | null; id: string }) { return <><PageTitle title="Settings" copy="Your connected Discord account and portal session." /><section className="np-settings"><span>DISPLAY NAME</span><strong>{name ?? "Carted member"}</strong><span>EMAIL</span><strong>{email ?? "Not shared by Discord"}</strong><span>DISCORD USER ID</span><strong>{id}</strong><form action={disconnectDiscord}><button className="save-button" type="submit">Sign out of Carted</button></form></section></>; }
function retailerLabel(value: string) { return retailers.find(retailer => retailer.id === value)?.name ?? "retailer"; }

function ProfilesView({ profiles, selected }: { profiles: Map<string, ServiceProfile>; selected: typeof retailers[number] }) {
  return <><PageTitle title="Profiles" copy="Pick a retailer to create or update your profile." /><div className="np-region-title"><span />CANADA<em>{retailers.length} RETAILERS</em></div><section className="np-retailer-picker">{retailers.map(retailer => { const profile = profiles.get(retailer.id); const active = retailer.id === selected.id; return <a className={active ? "selected" : ""} key={retailer.id} href={`/dashboard?view=profiles&retailer=${retailer.id}`}><div className={`np-retailer-logo ${retailer.id}`}>{retailer.id === "amazon" ? "a" : retailer.id === "walmart" ? "✦" : "●"}</div><strong>{retailer.name} CA</strong><span>● {profile ? "PROFILE READY" : "READY TO ADD"}</span><div className="np-capacity"><i /><i /><i /><i /><i /><i /><i /><i /></div><small>{profile ? "1 loaded" : "0 loaded"}<em>Qty {profile?.target_quantity ?? "—"}</em></small><b>{profile ? "Edit profile" : "+ Add a profile"}</b></a>; })}</section><ProfileEditor retailer={selected} profile={profiles.get(selected.id)} /></>;
}

function ProfileEditor({ retailer, profile }: { retailer: typeof retailers[number]; profile?: ServiceProfile }) {
  return <section className="np-profile-editor"><header><span className="np-editor-plus">+</span><div><small>▱ {profile ? "EDIT PROFILE" : "ADD PROFILE"}</small><h2>{profile ? "Update" : "Create"} Profile — {retailer.name} CA</h2><p>Tell Carted what you want us to target for your next checkout.</p></div></header><div className="np-privacy-note">Account passwords, payment card details, CVVs, and two-factor codes are not stored in this profile.</div><form action={saveServiceProfile}><input type="hidden" name="retailer" value={retailer.id} /><div className="np-form-grid"><label>Service type<select name="serviceType" defaultValue={profile?.service_type ?? "checkout"}><option value="checkout">Checkout assistance</option>{retailer.id !== "pokemon-center" ? <option value="account-generation">Account generation</option> : null}<option value="both">Both services</option></select></label><label>Retailer account email<input name="accountEmail" type="email" autoComplete="email" defaultValue={profile?.account_email ?? ""} placeholder="you@email.com" /></label><label>Target quantity<input name="targetQuantity" type="number" min="1" max="100" defaultValue={profile?.target_quantity ?? 1} required /></label><label className="wide">Product preferences<textarea name="productPreferences" maxLength={500} defaultValue={profile?.product_preferences ?? ""} placeholder="Products, sizes, colours, or acceptable alternatives" /></label><label className="wide">Additional notes<textarea name="notes" maxLength={1000} defaultValue={profile?.notes ?? ""} placeholder="Optional checkout instructions" /></label></div><button className="np-profile-save" type="submit">{profile ? "Update Profile" : "Save Profile"}</button>{profile ? <small className="np-updated">Last updated {new Date(profile.updated_at).toLocaleDateString("en-CA")}</small> : null}</form></section>;
}
