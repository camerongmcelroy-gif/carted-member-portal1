import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carted Member Portal",
  description: "Member account setup and checkout management for Carted.",
  icons: { icon: "/carted-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
