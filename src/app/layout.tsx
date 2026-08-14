import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/pwa/PWARegister";
import { CommandSearch } from "@/components/search/CommandSearch";

export const metadata: Metadata = {
  title: "Prestige Tiles — Inventory Control System",
  description: "Enterprise inventory, stock reservation, and depot management for Prestige Tiles",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Inventory",
  },
};

export const viewport: Viewport = {
  themeColor: "#050811",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F7F7F5] text-[#111111] antialiased font-sans">
        <PWARegister />
        <CommandSearch />
        {children}
      </body>
    </html>
  );
}
