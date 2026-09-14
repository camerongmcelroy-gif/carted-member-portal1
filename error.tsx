"use client";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="public-shell"><div className="panel empty-state"><h1>Your dashboard is temporarily unavailable.</h1><p>Your session is safe. Please try again or contact the Carted team.</p><button className="primary-button" onClick={reset}>Try again</button><a href="/">Return to sign in</a></div></main>;
}
