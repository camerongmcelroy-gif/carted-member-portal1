import "./home.css";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDiscord } from "./actions";

const steps = [
  {
    number: "01",
    title: "Sign in with Discord",
    copy: "Use your Carted member account to securely open your personal portal.",
  },
  {
    number: "02",
    title: "Send a checkout request",
    copy: "Choose a retailer, share the product link, and tell us how many you want.",
  },
  {
    number: "03",
    title: "Pay the fee securely",
    copy: "Your service fee is shown before checkout and paid through Stripe.",
  },
  {
    number: "04",
    title: "Follow your order",
    copy: "See progress, payment status, and tracking details from your dashboard.",
  },
];

export default async function SignInPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <a className="home-brand" href="/" aria-label="Carted member portal home">
          <Image src="/carted-logo.png" alt="" width={38} height={38} priority />
          <span>carted</span>
          <small>MEMBER PORTAL</small>
        </a>
        <nav className="home-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#member-tools">Member tools</a>
          <a className="home-nav-login" href="#sign-in">Sign in <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <span className="home-eyebrow"><i /> CARTED MEMBER PORTAL</span>
          <h1 id="home-title">Your next checkout, <em>all in one place.</em></h1>
          <p className="home-intro">Request checkout support, see your order progress, and keep track of fees and delivery—all from your personal Carted dashboard.</p>
          <div className="home-hero-actions">
            <form action={connectDiscord} id="sign-in">
              <button className="home-primary-button" type="submit">Continue with Discord <span aria-hidden="true">→</span></button>
            </form>
            <a className="home-secondary-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="home-signin-note">New to the portal? Sign in with the Discord account you use with Carted.</p>
        </div>

        <div className="home-preview" aria-label="Preview of your Carted member dashboard">
          <div className="home-preview-window">
            <div className="home-preview-top">
              <span className="home-preview-brand"><Image src="/carted-logo.png" alt="" width={23} height={23} /> CARTED</span>
              <span className="home-preview-avatar">M</span>
            </div>
            <div className="home-preview-content">
              <div className="home-preview-heading"><div><span>YOUR ACCOUNT</span><strong>Orders</strong></div><span className="home-preview-tag"><i /> MEMBER VIEW</span></div>
              <div className="home-preview-stats">
                <div><span>ACTIVE</span><strong>02</strong><small>orders</small></div>
                <div><span>IN TRANSIT</span><strong>01</strong><small>package</small></div>
                <div><span>FEES DUE</span><strong>$—</strong><small>CAD</small></div>
              </div>
              <article className="home-preview-order">
                <div className="home-preview-product"><span>TCG</span></div>
                <div className="home-preview-order-info"><span>POKÉMON CENTER CA</span><strong>Your checkout request</strong><small>Quantity  ·  1 item</small></div>
                <span className="home-preview-status">PROCESSING</span>
              </article>
              <article className="home-preview-order home-preview-order-muted">
                <div className="home-preview-product home-preview-walmart"><span>W</span></div>
                <div className="home-preview-order-info"><span>WALMART CA</span><strong>Order on its way</strong><small>Tracking updates in your portal</small></div>
                <span className="home-preview-status home-preview-shipped">SHIPPED</span>
              </article>
              <div className="home-preview-payment"><span><i>✓</i> Secure payment with Stripe</span><small>Fees shown before you pay</small></div>
            </div>
          </div>
          <div className="home-preview-caption"><i /> A clearer view of every request.</div>
        </div>
      </section>

      <section className="home-benefits" id="member-tools" aria-label="Member portal features">
        <article><span className="home-benefit-icon">▤</span><div><strong>Your orders</strong><p>Requests, status, and fees at a glance.</p></div></article>
        <article><span className="home-benefit-icon">↗</span><div><strong>Progress & tracking</strong><p>Know what’s processing and what shipped.</p></div></article>
        <article><span className="home-benefit-icon">$</span><div><strong>Clear order fees</strong><p>See the fee and payment status for each order.</p></div></article>
        <article><span className="home-benefit-icon">✓</span><div><strong>Secure payments</strong><p>Pay fees through Stripe’s hosted checkout.</p></div></article>
      </section>

      <section className="home-how" id="how-it-works">
        <div className="home-section-heading">
          <div><span className="home-eyebrow">A SIMPLE PLACE TO START</span><h2>From request to delivery.</h2></div>
          <p>Sign in to manage your Carted activity without chasing order updates across messages.</p>
        </div>
        <div className="home-steps">
          {steps.map(step => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-bottom-cta">
        <div><span className="home-eyebrow">READY WHEN YOU ARE</span><h2>Let’s get your dashboard set up.</h2><p>Sign in with Discord to view your Carted member portal.</p></div>
        <form action={connectDiscord}><button className="home-primary-button" type="submit">Sign in with Discord <span aria-hidden="true">→</span></button></form>
      </section>

      <footer className="home-footer">
        <a className="home-brand" href="/" aria-label="Carted home"><Image src="/carted-logo.png" alt="" width={28} height={28} /><span>carted</span></a>
        <span>Checkout support for Canadian collectors.</span>
        <a href="https://carted.ca">Visit carted.ca <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
