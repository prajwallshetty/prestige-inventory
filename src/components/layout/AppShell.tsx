import { Suspense } from "react";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { getPendingApprovalCount } from "@/services/BlockQueryService";
import { getNeedToOrderCount } from "@/services/ProcurementService";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import type { Role } from "@/lib/permissions";

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
  const session = await getEffectiveSession();

  // The warehouse/showroom lists exist solely to populate the Super Admin's
  // role-preview simulator. Fetching them for every user on every navigation
  // cost extra round trips that nobody else could see.
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const canSeeProcurement = session?.role === "MANAGER" || session?.role === "SUPER_ADMIN";

  const [warehouses, showrooms, pendingApprovalCount, needToOrderCount] = await Promise.all([
    isSuperAdmin
      ? db.warehouse.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isSuperAdmin
      ? db.showroom.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    // The badge tells an approver there is work waiting without making them
    // open the queue to find out.
    session
      ? getPendingApprovalCount({
          role: session.role as Role,
          userId: session.userId,
          showroomId: session.showroomId ?? null,
          warehouseId: session.warehouseId ?? null,
        }).catch(() => 0)
      : Promise.resolve(0),
    // Same idea for procurement — a Manager/Super Admin sees at a glance
    // whether anything is waiting to be ordered (overstock spec §9/§28).
    session && canSeeProcurement
      ? getNeedToOrderCount({
          role: session.role as Role,
          userId: session.userId,
          showroomId: session.showroomId ?? null,
          warehouseId: session.warehouseId ?? null,
        }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  return (
    // SidebarLayout reads the query string to highlight the active queue link,
    // which requires a Suspense boundary in a server-rendered tree.
    <Suspense fallback={null}>
      <SidebarLayout
        session={session}
        warehouses={warehouses}
        showrooms={showrooms}
        pendingApprovalCount={pendingApprovalCount}
        needToOrderCount={needToOrderCount}
      >
        {children}
      </SidebarLayout>
    </Suspense>
  );
}
