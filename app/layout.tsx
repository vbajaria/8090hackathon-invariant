import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INVARIANT — Refactor with proof",
  description:
    "Modernize your code. Preserve its behavior. Independent behavioral verification for agent-driven development.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
