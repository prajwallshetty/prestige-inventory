import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { PWARegister } from "@/components/pwa/PWARegister";
import { CommandSearch } from "@/components/search/CommandSearch";
import { RouteProgress } from "@/components/layout/RouteProgress";

import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Prestige Tiles — Inventory Control System",
  description: "Enterprise inventory, stock reservation, and depot management for Prestige Tiles",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Inventory",
  },
};

export const viewport: Viewport = {
  themeColor: "#F2C202",
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
        <Toaster position="top-right" richColors />
        {/* useSearchParams needs a Suspense boundary to avoid opting the whole
            tree into client-side rendering. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <PWARegister />
        <CommandSearch />
        {children}
      </body>
    </html>
  );
}
