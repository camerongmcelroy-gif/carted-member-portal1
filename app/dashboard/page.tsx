import "./prestige.css";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfiles, type ServiceProfile } from "@/lib/db";
import { isAdmin, listCheckouts, type Checkout } from "@/lib/checkouts";
import { getDefaultFeeCents, listMemberOrders, type MemberOrder } from "@/lib/member-orders";
import { disconnectDiscord, payMemberOrder, requestMemberOrder, saveServiceProfile } from "../actions";
import LiveCheckouts, { ProductImage } from "../components/live-checkouts";
import CopyReferral from "./copy-referral";

const retailers = [
  { id: "amazon", name: "Amazon", eyebrow: "AMAZON CA", description: "Checkout assistance and account setup preferences.", icon: "/retailers/amazon.svg" },
  { id: "walmart", name: "Walmart", eyebrow: "WALMART CA", description: "Configure product targets, quantities, and notes.", icon: "/retailers/walmart.svg" },
  { id: "pokemon-center", name: "Pokémon Center", eyebrow: "POKÉMON CENTER CA", description: "Submit product preferences with no artificial price cap.", icon: "/retailers/pokemon-center.svg" },
] as const;
const canadianProvinces = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"],
  ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"],
  ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
] as const;
const expiryYears = Array.from({ length: 16 }, (_, index) => new Date().getFullYear() + index);
const PROFILE_LIMIT = 15;

type View = "home" | "orders" | "wins" | "profiles" | "referrals" | "settings";
type SearchParams = Promise<{ saved?: string; error?: string; view?: string; retailer?: string; payment?: string; request?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const params = await searchParams;
  const view: View = ["home", "orders", "wins", "profiles", "referrals", "settings"].includes(params.view ?? "") ? params.view as View : "home";
  const [profiles, checkoutResult, orders, defaultFeeCents] = await Promise.all([
    getProfiles(session.user.id),
    ["profiles", "referrals", "settings"].includes(view) ? Promise.resolve({ items: [] as Checkout[], failed: false }) : listCheckouts(session.user.id).then(items => ({ items, failed: false })).catch(() => ({ items: [] as Checkout[], failed: true })),
    view === "orders" || view === "home" ? listMemberOrders(session.user.id) : Promise.resolve([] as MemberOrder[]),
    view === "orders" || view === "home" ? getDefaultFeeCents() : Promise.resolve(0),
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
    <aside className="np-sidebar"><p>CARTED MEMBER PORTAL</p><nav aria-label="Member dashboard"><NavItem view="orders" active={view} icon="▤" label="ORDERS" /><NavItem view="home" active={view} icon="⌂" label="OVERVIEW" /><NavItem view="wins" active={view} icon="✓" label="CHECKOUTS" /><NavItem view="profiles" active={view} icon="▱" label="PROFILES" /><a className="np-fees-link" href="/dashboard?view=orders#fees"><i aria-hidden="true">$</i>FEES</a><NavItem view="referrals" active={view} icon="♧" label="REFERRALS" /><NavItem view="settings" active={view} icon="☷" label="SETTINGS" />{isAdmin(session.user.id) ? <a className="np-admin-link" href="/dashboard/admin"><i aria-hidden="true">⚙</i>ADMIN ORDERS</a> : null}</nav><div className="np-pas"><span>ORDER FEES</span><strong>See each order</strong><small>Any fee and payment status will be shown with the order details below.</small></div><a className="np-back" href="https://carted.ca">← Back to carted.ca</a></aside>
    <main className="np-main">
      {params.saved ? <p className="notice success">Your {retailerLabel(params.saved)} profile was saved.</p> : null}
      {params.error ? <p className="notice error">{profileError(params.error)}</p> : null}
      {params.payment === "success" ? <p className="notice success">You returned from Stripe. Payment status will update after Carted receives confirmation.</p> : null}
      {params.payment === "cancelled" ? <p className="notice error">Payment was cancelled. Your order is saved, and you can try again from the order list.</p> : null}
      {params.request === "submitted" ? <p className="notice success">Your request was submitted.</p> : null}
      {view === "orders" ? <OrdersView orders={orders} defaultFeeCents={defaultFeeCents} email={session.user.email} /> : null}
      {view === "home" ? <HomeView profiles={profiles.length} confirmed={confirmed} cancelled={cancelled.length} weekWins={weekWins} weekUnits={weekUnits} feedFailed={checkoutResult.failed} /> : null}
      {view === "wins" ? <><PageTitle title="Checkouts" copy="Your checkout history, quantities, and order status." />{checkoutResult.failed ? <FeedError /> : <LiveCheckouts initial={checkouts} />}</> : null}
      {view === "profiles" ? <ProfilesView profiles={profilesByRetailer} selected={selectedRetailer} /> : null}
      {view === "referrals" ? <ReferralView /> : null}
      {view === "settings" ? <SettingsView name={session.user.name} email={session.user.email} id={session.user.id} /> : null}
    </main>
  </div>;
}

function NavItem({ view, active, icon, label }: { view: View; active: View; icon: string; label: string }) { return <a href={`/dashboard?view=${view}`} aria-current={view === active ? "page" : undefined}><i aria-hidden="true">{icon}</i>{label}</a>; }
function PageTitle({ title, copy }: { title: string; copy: string }) { return <div className="np-page-title"><h1>{title}</h1><p>{copy}</p></div>; }

function OrdersView({ orders, defaultFeeCents, email }: { orders: MemberOrder[]; defaultFeeCents: number; email?: string | null }) {
  const active = orders.filter(order => !["delivered", "cancelled"].includes(order.status));
  const inTransit = orders.filter(order => order.status === "shipped");
  const processing = orders.filter(order => ["submitted", "processing"].includes(order.status));
  const amountDueCents = orders.reduce((sum, order) => sum + (
    order.payment_status === "pending" && order.order_value_cents !== null
      ? order.order_value_cents * order.quantity + order.fee_cents
      : 0
  ), 0);
  const inventory = orders.filter(order => order.status === "secured");
  const orderValue = orders.reduce((sum, order) => sum + (order.order_value_cents ?? 0) * order.quantity, 0);
  const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

  return <><PageTitle title="Orders" copy="Your checkouts, delivery status, and service fees in one place." />
    <section className="member-order-stats" aria-label="Order summary">
      <OrderStat label="ACTIVE ORDERS" value={active.length} />
      <OrderStat label="IN TRANSIT" value={inTransit.length} />
      <OrderStat label="PROCESSING" value={processing.length} />
      <OrderStat label="AMOUNT DUE" value={money(amountDueCents)} />
      <OrderStat label="SECURED" value={inventory.length} />
      <OrderStat label="ORDER VALUE" value={money(orderValue)} />
    </section>
    <section className="member-request-panel">
      <header><div><h2>Request a checkout</h2><p>Carted will confirm the item price and service fee before you pay. Your order request will be saved first.</p></div><strong>Fee estimate: {money(defaultFeeCents)}</strong></header>
      <form action={requestMemberOrder}>
        <label>Retailer<select name="retailer" required defaultValue=""><option value="" disabled>Select retailer</option><option value="amazon">Amazon CA</option><option value="walmart">Walmart CA</option><option value="pokemon-center">Pokémon Center CA</option></select></label>
        <label>Product name<input name="product" required maxLength={200} placeholder="Product name" /></label>
        <label>Product link<input name="productUrl" type="url" required maxLength={1000} placeholder="https://..." /></label>
        <label>Quantity<input name="quantity" type="number" min="1" max="100" step="1" required defaultValue="1" /></label>
        <label>Contact email<input name="memberEmail" type="email" maxLength={254} required defaultValue={email ?? ""} /></label>
        <button className="member-request-submit">Submit checkout request</button>
      </form>
    </section>
    <section className="member-orders-panel" id="fees">
      <header><div><h2>Order history</h2><p>Carted confirms product pricing before you pay the item total and service fee securely with Stripe.</p></div><span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span></header>
      {!orders.length ? <div className="member-orders-empty"><strong>No orders yet</strong><p>When Carted adds a request or checkout to your account, it will appear here with its status and fee.</p><a href="/dashboard?view=profiles">View retailer profiles</a></div> :
        <div className="member-orders-scroll"><table className="member-orders-table"><thead><tr><th>STATUS</th><th>PRODUCT</th><th>RETAILER</th><th>QTY</th><th>TRACKING</th><th>DATE</th><th>ITEM TOTAL</th><th>SERVICE FEE</th><th>CHARGE</th></tr></thead>
          <tbody>{orders.map(order => <tr key={order.id}>
            <td><span className={`member-order-status ${order.status}`}>{order.status.replaceAll("_", " ")}</span></td>
            <td><div className="member-order-product">{order.product_image ? <img src={order.product_image} alt="" /> : null}<div><strong>{order.product}</strong>{order.product_url ? <small><a href={order.product_url} target="_blank" rel="noopener noreferrer">View product ↗</a></small> : null}{order.order_value_cents === null ? <small className="member-awaiting-price">Awaiting Carted price confirmation</small> : <small>{money(order.order_value_cents)} per item</small>}</div></div></td>
            <td>{retailerLabel(order.retailer)}</td><td>{order.quantity}</td>
            <td>{order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">{order.tracking_number ?? "Track order"} ↗</a> : order.tracking_number ?? "—"}</td>
            <td><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</time></td>
            <td>{order.order_value_cents === null ? "—" : money(order.order_value_cents * order.quantity)}</td>
            <td>{money(order.fee_cents)}</td>
            <td>{order.order_value_cents === null ? <small className="member-awaiting-price">Price pending</small> : <>
              <strong>{money(order.order_value_cents * order.quantity + order.fee_cents)}</strong>
              <small className={`member-fee-status ${order.payment_status}`}>{order.payment_status}</small>
              {order.payment_status === "pending" && order.status !== "cancelled" ? <form action={payMemberOrder}><input type="hidden" name="orderId" value={order.id} /><button className="member-pay-button">Pay total</button></form> : null}
            </>}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </>;
}

function OrderStat({ label, value }: { label: string; value: number | string }) {
  return <article><span>{label}</span><strong>{value}</strong></article>;
}

function HomeView({ profiles, confirmed, cancelled, weekWins, weekUnits, feedFailed }: { profiles: number; confirmed: Checkout[]; cancelled: number; weekWins: Checkout[]; weekUnits: number; feedFailed: boolean }) {
  return <><PageTitle title="Overview" copy="Your profiles, activity, and recent checkout wins." /><section className="np-summary"><article className="np-balance"><span className="np-card-label">● ORDER FEES</span><div><strong>CAD</strong><em>Per order</em></div><p>Check the Orders page for fee amounts and payment status.</p><small>✓ Clear order-by-order tracking</small></article><div className="np-totals"><MiniTotal tone="green" icon="✓" value={confirmed.length} label="Checkouts completed" /><MiniTotal tone="blue" icon="▱" value={`${profiles} / ${PROFILE_LIMIT}`} label="Retailer profiles active" /><MiniTotal tone="red" icon="⊘" value={cancelled} label="Cancellations logged" /></div></section><div className="np-section-line"><h2>This week’s activity</h2><span>Last 7 days</span></div><section className="np-week"><Metric icon="♛" value={weekWins.length} label="CHECKOUTS THIS WEEK" note="Confirmed in the last 7 days" /><Metric icon="▦" value={weekUnits} label="UNITS SECURED" note="Quantity across confirmed wins" /><Metric icon="▱" value={profiles} label="PROFILES READY" note={`${PROFILE_LIMIT} profile slots available`} /></section><section className="np-lower"><article className="np-recent"><h2><span />Recent wins</h2>{feedFailed ? <FeedError /> : confirmed.length ? confirmed.slice(0, 6).map(item => <WinRow key={item.id} item={item} />) : <div className="np-empty"><strong>Your next win belongs here.</strong><p>Confirmed Discord checkouts linked to your account will appear automatically.</p></div>}</article><article className="np-side-card"><h2>Account status</h2><div className="np-status-ring">{profiles}<small>of {PROFILE_LIMIT} profiles</small></div><p>{profiles >= PROFILE_LIMIT ? "All profile slots are ready." : `${PROFILE_LIMIT - profiles} profile slots available.`}</p><a href="/dashboard?view=profiles">Manage profiles →</a></article></section></>;
}

function MiniTotal({ tone, icon, value, label }: { tone: string; icon: string; value: string | number; label: string }) { return <article><span className={`np-total-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>; }
function Metric({ icon, value, label, note }: { icon: string; value: number; label: string; note: string }) { return <article><i>{icon}</i><strong>{value}</strong><span>{label}</span><small>{note}</small></article>; }
function WinRow({ item }: { item: Checkout }) { const price = item.price_cents == null ? "Price unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(item.price_cents / 100); return <div className="np-win"><ProductImage src={item.image_url} name={item.product} /><div><strong>{item.product}</strong><span>{item.retailer} · {price} · Qty {item.quantity ?? "—"}</span></div><time dateTime={item.checked_out_at}>{new Date(item.checked_out_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</time></div>; }
function FeedError() { return <div className="np-empty"><strong>Checkout feed unavailable.</strong><p>Your profiles are safe. Please try the feed again shortly.</p></div>; }
function SettingsView({ name, email, id }: { name?: string | null; email?: string | null; id: string }) { return <><PageTitle title="Settings" copy="Your connected Discord account and portal session." /><section className="np-settings"><span>DISPLAY NAME</span><strong>{name ?? "Carted member"}</strong><span>EMAIL</span><strong>{email ?? "Not shared by Discord"}</strong><span>DISCORD USER ID</span><strong>{id}</strong><form action={disconnectDiscord}><button className="save-button" type="submit">Sign out of Carted</button></form></section></>; }
function ReferralView() { return <><section className="np-ref-hero"><div><span>♧ INVITE YOUR NETWORK</span><h1>Share Carted and earn credit.</h1><p>Invite someone interested in ACO. Once they join the Carted Discord and their signup is confirmed, you receive a <strong>$10 account credit</strong>.</p><CopyReferral /></div><aside><strong>$0</strong><span>CREDIT EARNED</span></aside></section><section className="np-ref-stats"><article><i>♧</i><span>REFERRALS</span><strong>0</strong><p>Confirmed members referred by you.</p></article><article><i>$</i><span>PER REFERRAL</span><strong className="green">$10</strong><p>Account credit per confirmed signup.</p></article><article><i>✓</i><span>VERIFICATION</span><strong>Manual</strong><p>Carted verifies each new member signup.</p></article></section><section className="np-ref-panel"><h2>Your referrals</h2><div className="np-ref-empty">No confirmed referrals yet. Share your invite link above and contact the Carted team when someone signs up.</div></section><section className="np-ref-panel"><h2>How it works</h2><ol><li><b>1</b><div><strong>Share your link</strong><span>Send the Carted Discord invitation to someone interested in joining.</span></div></li><li><b>2</b><div><strong>They join and sign up</strong><span>Your referral joins the Carted Discord and registers for ACO.</span></div></li><li><b>3</b><div><strong>Receive your credit</strong><span>After Carted confirms the signup, $10 is applied to your account.</span></div><em>$10</em></li></ol></section></>; }
function retailerLabel(value: string) { return retailers.find(retailer => retailer.id === value)?.name ?? "retailer"; }
function profileError(value: string) {
  if (value === "app-password") return "Enter the Walmart app password before saving this profile.";
  if (value === "amazon-password") return "Enter the Amazon account password before saving this profile.";
  if (value === "amazon-details") return "Enter the Amazon email and accept the profile terms before saving.";
  if (value === "encryption-key") return "Walmart app-password storage is not configured yet. Add PROFILE_ENCRYPTION_KEY in Vercel, then redeploy.";
  if (value === "payment-method") return "Select Visa, Mastercard, or Amex before saving the Pokémon Center profile.";
  if (value === "profile-details") return "Complete the required Pokémon Center contact and shipping fields before saving.";
  if (value === "walmart-details") return "Complete all required Walmart account, card reference, and shipping fields.";
  return "That submission could not be saved. Please try again.";
}

function ProfilesView({ profiles, selected }: { profiles: Map<string, ServiceProfile>; selected: typeof retailers[number] }) {
  return <><PageTitle title="Profiles" copy="Pick a retailer to create or update your profile." /><div className="np-region-title"><span />CANADA<em>{retailers.length} RETAILERS</em></div><section className="np-retailer-picker">{retailers.map(retailer => { const profile = profiles.get(retailer.id); const active = retailer.id === selected.id; return <a className={active ? "selected" : ""} key={retailer.id} href={`/dashboard?view=profiles&retailer=${retailer.id}`}><div className={`np-retailer-logo ${retailer.id}`}><Image src={retailer.icon} alt={`${retailer.name} logo`} width={45} height={45} /></div><strong>{retailer.name} CA</strong><span>● {profile ? "PROFILE READY" : "READY TO ADD"}</span><div className="np-capacity"><i /><i /><i /><i /><i /><i /><i /><i /></div><small>{profile ? "1 loaded" : "0 loaded"}<em>Qty {profile?.target_quantity ?? "—"}</em></small><b>{profile ? "Edit profile" : "+ Add a profile"}</b></a>; })}</section><ProfileEditor retailer={selected} profile={profiles.get(selected.id)} /></>;
}

function ProfileEditor({ retailer, profile }: { retailer: typeof retailers[number]; profile?: ServiceProfile }) {
  const isWalmart = retailer.id === "walmart";
  const isPokemonCenter = retailer.id === "pokemon-center";
  const privacyMessage = isWalmart
    ? "The Walmart app password is encrypted and never displayed. Only card type, last four digits, and expiry are stored; full card numbers and CVVs are never collected."
    : isPokemonCenter
      ? "Only the selected card type is stored. Card numbers, expiry dates, CVVs, passwords, and two-factor codes are not collected."
      : "The Amazon password is encrypted and never displayed after saving. CVVs and permanent 2FA authentication keys are never collected.";

  return <section className="np-profile-editor">
    <header><span className="np-editor-plus">+</span><div><small>▱ {profile ? "EDIT PROFILE" : "ADD PROFILE"}</small><h2>{profile ? "Update" : "Create"} Profile — {retailer.name} CA</h2><p>{isWalmart ? "Add your account, safe card reference, and shipping details for checkout." : isPokemonCenter ? "Add the shipping and payment preferences needed for checkout." : "Tell Carted what you want us to target for your next checkout."}</p></div></header>
    <div className="np-privacy-note">{privacyMessage}</div>
    <form action={saveServiceProfile}>
      <input type="hidden" name="retailer" value={retailer.id} />
      <input type="hidden" name="serviceType" value="auto-checkout" />
      <input type="hidden" name="existingProfile" value={profile ? "1" : ""} />
      <div className="np-form-grid">
        <label>Service type<span className="np-readonly-field">Auto checkout</span></label>
        {isWalmart ? <>
          <label>Catchall<input name="accountEmail" type="text" autoComplete="email" defaultValue={profile?.account_email ?? ""} placeholder="yourdomain.ca or catchall@email.com" required /></label>
          <label className="wide">App password<input name="appPassword" type="password" autoComplete="new-password" maxLength={200} placeholder={profile ? "Leave blank to keep the current app password" : "Enter the IMAP app password"} required={!profile} /><small className="np-field-help">Encrypted when saved and never shown again.</small></label>
          <div className="np-checkout-steps wide"><strong><i>1</i> Account</strong><span /><em><i>2</i> Shipping</em></div>
          <label>Name on card<input name="cardholderName" autoComplete="cc-name" maxLength={150} defaultValue={profile?.cardholder_name ?? ""} placeholder="John Smith" required /></label>
          <label>Card type<select name="paymentMethod" autoComplete="cc-type" defaultValue={profile?.payment_method ?? ""} required><option value="" disabled>Select card type</option><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="amex">Amex</option></select></label>
          <label>Last four digits<input name="cardLastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={profile?.card_last_four ?? ""} placeholder="1111" required /><small className="np-field-help">Do not enter the full card number.</small></label>
          <label>Expiry month<select name="cardExpiryMonth" autoComplete="cc-exp-month" defaultValue={profile?.card_expiry_month ?? ""} required><option value="" disabled>Month</option>{Array.from({ length: 12 }, (_, index) => index + 1).map(month => <option key={month} value={month}>{String(month).padStart(2, "0")}</option>)}</select></label>
          <label>Expiry year<select name="cardExpiryYear" autoComplete="cc-exp-year" defaultValue={profile?.card_expiry_year ?? ""} required><option value="" disabled>Year</option>{expiryYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>First name<input name="firstName" autoComplete="given-name" maxLength={100} defaultValue={profile?.first_name ?? ""} required /></label>
          <label>Last name<input name="lastName" autoComplete="family-name" maxLength={100} defaultValue={profile?.last_name ?? ""} required /></label>
          <label className="wide">Phone number<input name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={profile?.phone ?? ""} placeholder="416-555-0123" required /></label>
          <label className="wide">Address line 1<input name="shippingAddress" autoComplete="address-line1" maxLength={300} defaultValue={profile?.shipping_address ?? ""} placeholder="123 Main St" required /></label>
          <label className="wide">Address line 2<input name="addressLine2" autoComplete="address-line2" maxLength={120} defaultValue={profile?.address_line_2 ?? ""} placeholder="Unit 4 (optional)" /></label>
          <label>City<input name="city" autoComplete="address-level2" maxLength={120} defaultValue={profile?.city ?? ""} required /></label>
          <label>Province<select name="province" autoComplete="address-level1" defaultValue={profile?.province ?? ""} required><option value="" disabled>Select province</option>{canadianProvinces.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label>Postal code<input name="postalCode" autoComplete="postal-code" maxLength={20} defaultValue={profile?.postal_code ?? ""} placeholder="A1A 1A1" required /></label>
          <div className="np-billing-section wide">
            <label className="np-switch-row"><span><strong>Billing address same as shipping</strong><small>Turn this off to enter a separate billing address.</small></span><input name="billingSameAsShipping" type="checkbox" defaultChecked={profile?.billing_same_as_shipping ?? true} /><i aria-hidden="true" /></label>
            <div className="np-billing-fields">
              <label className="wide">Billing address line 1<input name="billingAddressLine1" autoComplete="billing address-line1" maxLength={300} defaultValue={profile?.billing_address_line_1 ?? ""} placeholder="123 Main St" /></label>
              <label className="wide">Billing address line 2<input name="billingAddressLine2" autoComplete="billing address-line2" maxLength={120} defaultValue={profile?.billing_address_line_2 ?? ""} placeholder="Unit 4 (optional)" /></label>
              <label>Billing city<input name="billingCity" autoComplete="billing address-level2" maxLength={120} defaultValue={profile?.billing_city ?? ""} /></label>
              <label>Billing province<select name="billingProvince" autoComplete="billing address-level1" defaultValue={profile?.billing_province ?? ""}><option value="" disabled>Select province</option>{canadianProvinces.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
              <label>Billing postal code<input name="billingPostalCode" autoComplete="billing postal-code" maxLength={20} defaultValue={profile?.billing_postal_code ?? ""} placeholder="A1A 1A1" /></label>
            </div>
          </div>
        </> : isPokemonCenter ? <label>Email<input name="accountEmail" type="email" autoComplete="email" defaultValue={profile?.account_email ?? ""} placeholder="you@email.com" required /></label> : <>
          <div className="np-amazon-warning wide">Amazon may lock or suspend accounts. By submitting a profile, you acknowledge this possibility.</div>
          <label>Amazon email<input name="accountEmail" type="email" autoComplete="email" defaultValue={profile?.account_email ?? ""} placeholder="you@email.com" required /></label>
          <label>Amazon password<input name="appPassword" type="password" autoComplete="new-password" maxLength={200} placeholder={profile ? "Leave blank to keep the current password" : "Password"} required={!profile} /><small className="np-field-help">Encrypted when saved and never shown again.</small></label>
          <label className="wide">Two-factor authentication<select name="twoFactorEnabled" defaultValue={profile?.two_factor_enabled ? "yes" : "no"} required><option value="no">Not enabled</option><option value="yes">Enabled — request a one-time code when needed</option></select><small className="np-field-help">Do not enter your permanent 2FA setup key.</small></label>
          <label className="np-terms-row wide"><input name="termsAccepted" type="checkbox" required /><span>I understand the account risks and agree to the Carted profile terms.</span></label>
          <div className="np-edit-window wide">Once saved, contact Carted within <strong>30 minutes</strong> if anything needs to be corrected.</div>
        </>}
        {isPokemonCenter ? <>
          <div className="np-checkout-steps wide"><strong><i>1</i> Shipping</strong><span /><em><i>2</i> Payment</em></div>
          <label>First name<input name="firstName" autoComplete="given-name" maxLength={100} defaultValue={profile?.first_name ?? ""} required /></label>
          <label>Last name<input name="lastName" autoComplete="family-name" maxLength={100} defaultValue={profile?.last_name ?? ""} required /></label>
          <label className="wide">Phone number<input name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={profile?.phone ?? ""} placeholder="416-555-0123" required /></label>
          <label className="wide">Address line 1<input name="shippingAddress" autoComplete="address-line1" maxLength={300} defaultValue={profile?.shipping_address ?? ""} placeholder="123 Main St" required /></label>
          <label className="wide">Address line 2<input name="addressLine2" autoComplete="address-line2" maxLength={120} defaultValue={profile?.address_line_2 ?? ""} placeholder="Unit 4 (optional)" /></label>
          <label>City<input name="city" autoComplete="address-level2" maxLength={120} defaultValue={profile?.city ?? ""} required /></label>
          <label>Province<select name="province" autoComplete="address-level1" defaultValue={profile?.province ?? ""} required><option value="" disabled>Select province</option>{canadianProvinces.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label>Postal code<input name="postalCode" autoComplete="postal-code" maxLength={20} defaultValue={profile?.postal_code ?? ""} placeholder="A1A 1A1" required /></label>
          <div className="np-billing-section wide">
            <label className="np-switch-row"><span><strong>Billing address same as shipping</strong><small>Turn this off to enter a separate billing address.</small></span><input name="billingSameAsShipping" type="checkbox" defaultChecked={profile?.billing_same_as_shipping ?? true} /><i aria-hidden="true" /></label>
            <div className="np-billing-fields">
              <label className="wide">Billing address line 1<input name="billingAddressLine1" autoComplete="billing address-line1" maxLength={300} defaultValue={profile?.billing_address_line_1 ?? ""} placeholder="123 Main St" /></label>
              <label className="wide">Billing address line 2<input name="billingAddressLine2" autoComplete="billing address-line2" maxLength={120} defaultValue={profile?.billing_address_line_2 ?? ""} placeholder="Unit 4 (optional)" /></label>
              <label>Billing city<input name="billingCity" autoComplete="billing address-level2" maxLength={120} defaultValue={profile?.billing_city ?? ""} /></label>
              <label>Billing province<select name="billingProvince" autoComplete="billing address-level1" defaultValue={profile?.billing_province ?? ""}><option value="" disabled>Select province</option>{canadianProvinces.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
              <label>Billing postal code<input name="billingPostalCode" autoComplete="billing postal-code" maxLength={20} defaultValue={profile?.billing_postal_code ?? ""} placeholder="A1A 1A1" /></label>
            </div>
          </div>
          <label className="wide">Payment information<select name="paymentMethod" autoComplete="cc-type" defaultValue={profile?.payment_method ?? ""} required><option value="" disabled>Select card type</option><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="amex">Amex</option></select></label>
        </> : null}
        {!isPokemonCenter && !isWalmart ? <>
          <label className="wide">Product preferences<textarea className="compact" name="productPreferences" maxLength={500} defaultValue={profile?.product_preferences ?? ""} placeholder="Products, sizes, colours, or acceptable alternatives" /></label>
          <label className="wide">Additional notes<textarea className="compact" name="notes" maxLength={1000} defaultValue={profile?.notes ?? ""} placeholder="Optional checkout instructions" /></label>
        </> : null}
        <label className="wide">Target quantity<input name="targetQuantity" type="number" min="1" max="100" defaultValue={profile?.target_quantity ?? 1} required /></label>
      </div>
      <button className="np-profile-save" type="submit">{profile ? "Update Profile" : "Save Profile"}</button>
      {profile ? <small className="np-updated">Last updated {new Date(profile.updated_at).toLocaleDateString("en-CA")}</small> : null}
    </form>
  </section>;
}
