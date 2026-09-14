"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Checkout } from "@/lib/checkouts";

export function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="product-image"><Image src={!failed && src ? src : "/carted-logo.png"} alt={name} width={96} height={96} unoptimized onError={() => setFailed(true)} /></div>;
}
export default function LiveCheckouts({ initial, publicFeed = false }: { initial: Checkout[]; publicFeed?: boolean }) {
  const [items, setItems] = useState(initial);
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden) return;
      try {
        const res = await fetch(publicFeed ? "/api/checkouts?public=1" : "/api/checkouts", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!disposed) { setItems(data.items); setStale(false); }
      } catch { if (!disposed) setStale(true); }
    }
    const timer = setInterval(refresh, 15000);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [publicFeed]);
  const visible = items.filter(item => filter === "all" || item.retailer === filter);
  return <section className="panel checkout-panel">
    <div className="panel-heading"><div><h2>{publicFeed ? "Latest confirmed checkouts" : "Your recent checkouts"}</h2><p>{stale ? "Updates paused. Retrying shortly…" : "Refreshes every 15 seconds · Latest 100 records"}</p></div><select aria-label="Filter by retailer" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All retailers</option><option>Amazon CA</option><option>Walmart CA</option><option>Pokémon Center CA</option></select></div>
    {!visible.length ? <div className="empty-state"><span className="empty-symbol">↗</span><h3>{publicFeed ? "The next success starts here." : "Your next checkout belongs here."}</h3><p>{publicFeed ? "Confirmed product checkouts will appear here as they are reviewed." : "Once your checkout emails are linked by the team, your orders will appear automatically."}</p></div> : <div className="checkout-grid">{visible.map(item => <article className="checkout-card" key={item.id}>
      <div className="checkout-top"><ProductImage src={item.image_url} name={item.product} /><span className={`badge ${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>
      <span className="eyebrow">{item.retailer}</span><h3>{item.product}</h3>
      <div className="checkout-values"><strong>{item.price_cents == null ? "Price unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(item.price_cents / 100)}</strong><span>Qty {item.quantity ?? "—"}</span></div>
      <time dateTime={item.checked_out_at}>{new Date(item.checked_out_at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ET</time>
    </article>)}</div>}
  </section>;
}
