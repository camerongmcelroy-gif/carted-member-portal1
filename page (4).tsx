import Link from "next/link";
import LiveCheckouts from "../components/live-checkouts";
import { listCheckouts } from "@/lib/checkouts";
export const dynamic = "force-dynamic";
export default async function Successes() {
  const items = await listCheckouts();
  return <main className="public-shell"><Link className="brand" href="/">Carted<span> / COMMUNITY</span></Link><div className="page-heading"><span className="eyebrow">THE SUCCESS FEED</span><h1>Good products.<br />Great checkouts.</h1><p>Confirmed checkouts from the Carted community.</p></div><LiveCheckouts initial={items} publicFeed /></main>;
}
