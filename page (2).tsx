import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { isAdmin, listAdminCheckouts } from "@/lib/checkouts";
import { assignEmail, reviewCheckout } from "../../admin-actions";

export default async function Admin() {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) notFound();
  const items = await listAdminCheckouts();
  return <main className="public-shell"><a className="back-link" href="/dashboard">← Member dashboard</a><h1>Checkout review</h1><p>Verify the retailer order before confirming a checkout. Confirmed records appear on the public success feed.</p><section className="panel retailer-card"><h2>Link a member</h2><p>Only link an email after verifying that it belongs to this Discord member.</p><form action={assignEmail}><label>Checkout email<input name="email" type="email" required maxLength={254} /></label><label>Discord user ID<input name="member" required pattern="[0-9]{17,20}" /></label><button className="save-button">Link existing checkouts</button></form></section><section className="panel"><h2>Latest 100 records</h2>{items.length === 0 ? <p>No checkout records imported yet.</p> : items.map(item => <article className="retailer-card" key={item.id}><h3>{item.product}</h3><p>{item.retailer} · {item.checkout_email ?? "No email"} · {item.member_id ? "Member linked" : "Unassigned"}</p>{item.warning ? <p className="notice error">Retailer verification required. Do not confirm without checking the order.</p> : null}<form action={reviewCheckout}><input type="hidden" name="id" value={item.id} /><label>Order status<select name="status" defaultValue={item.status}><option value="needs_review">Needs review</option><option value="confirmed">Confirmed — publish to public feed</option><option value="cancelled">Cancelled</option></select></label><button className="save-button">Save review</button></form></article>)}</section></main>;
}
