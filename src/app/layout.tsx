import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prestige Tiles — Inventory Control System",
  description: "Enterprise inventory, stock reservation, and depot management for Prestige Tiles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0f19] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
