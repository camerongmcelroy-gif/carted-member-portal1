import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDiscord } from "./actions";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>Carted</h1>
        <h2>Your checkout workspace.</h2>
        <p>Connect Discord to manage your retailer profiles.</p>

        <form action={connectDiscord}>
          <button className="discord-button" type="submit">
            Continue with Discord
          </button>
        </form>
      </section>
    </main>
  );
}
