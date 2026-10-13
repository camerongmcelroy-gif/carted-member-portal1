import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { isAdmin, listAdminCheckouts } from "@/lib/checkouts";
import {
  addMemberOrder,
  assignEmail,
  changeDefaultMemberFee,
  reviewCheckout,
  saveCatalogProductAction,
  setCatalogProductActiveAction,
  updateMemberOrderPricingAction,
  updateMemberOrderAction,
} from "../../admin-actions";
import { getDefaultFeeCents, listAllMemberOrders, listCatalogProducts } from "@/lib/member-orders";

export default async function Admin() {
  const session = await auth();
  if (!isAdmin(session?.user?.id)) notFound();
  const [items, orders, defaultFeeCents, products] = await Promise.all([
    listAdminCheckouts(),
    listAllMemberOrders(),
    getDefaultFeeCents(),
    listCatalogProducts(),
  ]);
  return <main className="public-shell"><a className="back-link" href="/dashboard">← Member dashboard</a><h1>Order management</h1><p>Create member orders, set fees, and keep order and payment status up to date.</p>
    <section className="panel retailer-card"><h2>Default checkout fee</h2><p>New orders use this fee as a starting point. You can set a different fee on each order.</p><form action={changeDefaultMemberFee}><label>Default fee (CAD)<input name="defaultFee" type="number" min="0" max="999999.99" step="0.01" required defaultValue={(defaultFeeCents / 100).toFixed(2)} /></label><button className="save-button">Save default fee</button></form></section>
    <section className="panel"><h2>Product catalog</h2><p>Add reusable products with an image and default item price. Product images are stored with the catalog for your orders.</p>
      <form action={saveCatalogProductAction} className="catalog-product-form">
        <label>Product name<input name="name" required maxLength={200} /></label>
        <label>Retailer<select name="retailer" required defaultValue=""><option value="" disabled>Select retailer</option><option value="amazon">Amazon CA</option><option value="walmart">Walmart CA</option><option value="pokemon-center">Pokémon Center CA</option></select></label>
        <label>Category (optional)<input name="category" maxLength={80} placeholder="e.g. Booster box" /></label>
        <label>Default item price (CAD)<input name="unitPrice" type="number" min="0" max="999999.99" step="0.01" required /></label>
        <label>Product image (JPG, PNG, WebP; max 1 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button className="save-button">Add product</button>
      </form>
      {products.length ? <div className="catalog-product-grid">{products.map(product => <article className={`catalog-product-card${product.active ? "" : " archived"}`} key={product.id}>
        <img src={product.image_data} alt={product.name} />
        <form action={saveCatalogProductAction} className="catalog-product-edit">
          <input type="hidden" name="id" value={product.id} />
          <label>Product name<input name="name" required maxLength={200} defaultValue={product.name} /></label>
          <label>Retailer<select name="retailer" required defaultValue={product.retailer}><option value="amazon">Amazon CA</option><option value="walmart">Walmart CA</option><option value="pokemon-center">Pokémon Center CA</option></select></label>
          <label>Category<input name="category" maxLength={80} defaultValue={product.category} /></label>
          <label>Default price (CAD)<input name="unitPrice" type="number" min="0" max="999999.99" step="0.01" required defaultValue={(product.unit_price_cents / 100).toFixed(2)} /></label>
          <label>Replace image (optional)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <button className="save-button">Save product</button>
        </form>
        <form action={setCatalogProductActiveAction}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="active" value={String(!product.active)} /><button className="catalog-archive-button">{product.active ? "Archive" : "Restore"}</button></form>
      </article>)}</div> : <p>No products in your catalog yet.</p>}
    </section>
    <section className="panel retailer-card"><h2>Add an order for a member</h2><p>Enter the member’s Discord user ID from their portal session. Never enter retailer passwords or payment card details here.</p>{products.some(product => product.active) ? <form action={addMemberOrder}>
      <label>Member email<input name="memberEmail" type="email" required maxLength={254} /></label>
      <label>Discord user ID<input name="memberId" required pattern="[0-9]{17,20}" /></label>
      <label>Product<select name="productId" required defaultValue=""><option value="" disabled>Select catalog product</option>{products.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.name} · {product.retailer} · ${(product.unit_price_cents / 100).toFixed(2)} CAD</option>)}</select></label>
      <label>Quantity<input name="quantity" type="number" min="1" max="100" step="1" required defaultValue="1" /></label>
      <label>Item price override (CAD, optional)<input name="orderValue" type="number" min="0" max="999999.99" step="0.01" /><small>Leave blank to use the catalog price.</small></label>
      <label>Service fee (CAD)<input name="fee" type="number" min="0" max="999999.99" step="0.01" required defaultValue={(defaultFeeCents / 100).toFixed(2)} /></label>
      <button className="save-button">Create member order</button>
    </form> : <p>Add a catalog product before creating a member order.</p>}</section>
    <section className="panel"><h2>Member orders</h2>{orders.length === 0 ? <p>No manual member orders yet.</p> : orders.map(order => <article className="retailer-card admin-order-card" key={order.id}>
      {order.product_image ? <img className="admin-order-image" src={order.product_image} alt={order.product} /> : null}
      <h3>{order.product}</h3><p>{order.member_email} · {order.retailer} · Qty {order.quantity} · {order.order_value_cents === null ? "Item price awaiting confirmation" : `Item ${((order.order_value_cents * order.quantity) / 100).toFixed(2)} CAD`} · Fee ${(order.fee_cents / 100).toFixed(2)} CAD · Total {order.order_value_cents === null ? "—" : `$${((order.order_value_cents * order.quantity + order.fee_cents) / 100).toFixed(2)} CAD`}</p>
    {order.payment_status !== "paid" && order.payment_status !== "refunded" && order.status !== "cancelled" ? <form action={updateMemberOrderPricingAction} className="admin-pricing-form">
      <input type="hidden" name="id" value={order.id} />
      <label>Product<select name="productId" required defaultValue={order.catalog_product_id ?? ""}><option value="" disabled>Select catalog product</option>{products.filter(product => product.active || product.id === order.catalog_product_id).map(product => <option key={product.id} value={product.id}>{product.name} · {product.retailer}</option>)}</select></label>
      <label>Quantity<input name="quantity" type="number" min="1" max="100" step="1" required defaultValue={order.quantity} /></label>
      <label>Item price (CAD)<input name="unitPrice" type="number" min="0" max="999999.99" step="0.01" required defaultValue={order.order_value_cents === null ? "" : (order.order_value_cents / 100).toFixed(2)} /></label>
      <label>Service fee (CAD)<input name="fee" type="number" min="0" max="999999.99" step="0.01" required defaultValue={(order.fee_cents / 100).toFixed(2)} /></label>
      <button className="save-button">Save verified price and fee</button>
    </form> : null}
    <form action={updateMemberOrderAction}>
      <input type="hidden" name="id" value={order.id} />
      <label>Order status<select name="status" defaultValue={order.status}><option value="submitted">Submitted</option><option value="processing">Processing</option><option value="secured">Secured</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label>
      <label>Payment status<select name="paymentStatus" defaultValue={order.payment_status}><option value="pending" disabled={order.order_value_cents === null || order.order_value_cents * order.quantity + order.fee_cents <= 0 || order.payment_status === "paid" || order.payment_status === "refunded"}>Payment pending</option><option value="paid" disabled={order.payment_status !== "paid"}>Paid (Stripe)</option><option value="waived" disabled={order.order_value_cents === null || order.order_value_cents * order.quantity + order.fee_cents <= 0 || order.payment_status === "paid" || order.payment_status === "refunded"}>Waived</option><option value="refunded" disabled={order.payment_status !== "paid" && order.payment_status !== "refunded"}>Issue full Stripe refund</option></select></label>
      <label>Tracking number<input name="trackingNumber" maxLength={100} defaultValue={order.tracking_number ?? ""} /></label>
      <label>Tracking link (HTTPS)<input name="trackingUrl" type="url" maxLength={500} defaultValue={order.tracking_url ?? ""} /></label>
      <button className="save-button">Save order</button>
    </form></article>)}</section>
    <section className="panel retailer-card"><h2>Link a member to imported checkout emails</h2><p>Only link an email after verifying that it belongs to this Discord member.</p><form action={assignEmail}><label>Checkout email<input name="email" type="email" required maxLength={254} /></label><label>Discord user ID<input name="member" required pattern="[0-9]{17,20}" /></label><button className="save-button">Link existing checkouts</button></form></section>
    <section className="panel"><h2>Latest 100 imported checkouts</h2>{items.length === 0 ? <p>No checkout records imported yet.</p> : items.map(item => <article className="retailer-card" key={item.id}><h3>{item.product}</h3><p>{item.retailer} · {item.checkout_email ?? "No email"} · {item.member_id ? "Member linked" : "Unassigned"}</p>{item.warning ? <p className="notice error">Retailer verification required. Do not confirm without checking the order.</p> : null}<form action={reviewCheckout}><input type="hidden" name="id" value={item.id} /><label>Order status<select name="status" defaultValue={item.status}><option value="needs_review">Needs review</option><option value="confirmed">Confirmed — publish to public feed</option><option value="cancelled">Cancelled</option></select></label><button className="save-button">Save review</button></form></article>)}</section>
  </main>;
}
