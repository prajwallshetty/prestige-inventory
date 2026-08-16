import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

/**
 * Server-rendered application chrome.
 *
 * Mounted from each role section's layout.tsx so the sidebar/topbar persist
 * across navigations instead of remounting per page. The session and picker
 * lists are resolved here rather than in a client effect — previously every
 * navigation refetched them client-side and blanked the page behind a shimmer
 * while it waited, which is what made clicks feel dead.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, dealers, warehouses, showrooms] = await Promise.all([
    getEffectiveSession(),
    db.dealer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.showroom.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <SidebarLayout
      session={session}
      dealers={dealers}
      warehouses={warehouses}
      showrooms={showrooms}
    >
      {children}
    </SidebarLayout>
  );
}
