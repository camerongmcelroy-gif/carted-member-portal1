import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDiscord } from "./actions";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-lockup">
          <Image
            src="/carted-logo.png"
            alt="Carted"
            width={64}
            height={64}
            priority
          />

          <div>
            <span>MEMBER PORTAL</span>
            <h1>Carted</h1>
          </div>
        </div>

        <h2>Your checkout workspace.</h2>
        <p>Connect Discord to manage your retailer profiles.</p>

        <form action={connectDiscord}>
          <button className="discord-button" type="submit">
            Continue with Discord
          </button>
        </form>

        <div className="login-note">
          <strong>Pay after success</strong>
          <span>No service cost until your product is secured.</span>
        </div>

        <a className="back-link" href="https://carted.ca">
          Back to Carted ↗
        </a>
      </section>
    </main>
  );
}
