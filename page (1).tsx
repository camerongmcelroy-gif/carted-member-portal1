import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDiscord } from "./actions";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-lockup"><Image src="/carted-logo.png" alt="Carted" width={72} height={72} priority /><div><span>MEMBER ACCESS</span><h1>Carted</h1></div></div>
      <h2>Your checkout workspace.</h2>
      <p>Connect Discord to manage retailer setup preferences and keep every submission tied to the correct member.</p>
      <form action={connectDiscord}><button className="discord-button" type="submit"><span className="discord-mark">◉</span>Continue with Discord</button></form>
      <div className="login-note"><b>Secure connection</b><span>Carted receives your Discord identity and email only. Your password stays with Discord.</span></div>
      <a className="back-link" href="https://carted.ca">← Return to carted.ca</a>
    </section>
  </main>;
}
