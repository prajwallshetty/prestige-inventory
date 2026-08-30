import { redirect } from "next/navigation";
import { getInventorySummary } from "@/services/InventoryService";
import { getSessionContext } from "@/lib/session";
import { PENDING_BLOCK_STATUSES, isShowroomScoped } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DashboardClient } from "@/app/(app)/dashboard/DashboardClient";

export const revalidate = 0; // Dynamic server-side rendering

export default async function DashboardPage() {
  // Session is cookie-only (no DB round trip), so it can gate the dealer
  // queries without costing latency.
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  // Route audit finding: this page previously showed every showroom's
  // pending blocks (and a system-wide movement feed) to Showroom Staff/
  // In-Charge — the same scope rule /blocks already enforces belongs here
  // too. Movements carry no showroomId at all, so there's no scoped view to
  // fall back to for a showroom role — the feed is simply omitted for them
  // rather than shown unscoped.
  const scoped = isShowroomScoped(session.role);

  // Every independent read goes out in ONE parallel batch. The database is
  // geographically remote (~1.5s per round trip), so awaiting these in
  // sequence costs seconds of pure network wait — parallel is ~7x faster.
  const [summary, recentMovements, pendingBlocks] = await Promise.all([
    getInventorySummary(),
    scoped
      ? Promise.resolve([])
      : db.inventoryMovement.findMany({
          take: 8,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            quantity: true,
            movementType: true,
            reason: true,
            performedBy: true,
            createdAt: true,
            inventory: {
              select: {
                productId: true,
                product: { select: { name: true, sku: true, size: true } },
              },
            },
          },
        }),
    db.stockBlock.findMany({
      where: {
        status: { in: [...PENDING_BLOCK_STATUSES] },
        ...(scoped ? { showroomId: session.showroomId ?? "__none__" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        block_number: true,
        quantity: true,
        status: true,
        requestedBy: true,
        remarks: true,
        createdAt: true,
        dealer: { select: { name: true, company: true } },
      },
    }),
  ]);

  // Serialize movements dates
  const serializedMovements = recentMovements.map((m) => ({
    id: m.id,
    quantity: m.quantity,
    movementType: m.movementType,
    reason: m.reason,
    performedBy: m.performedBy,
    createdAt: m.createdAt.toISOString(),
    inventory: m.inventory ? {
      product: {
        name: m.inventory.product.name,
        sku: m.inventory.product.sku || null,
        size: m.inventory.product.size || null,
      }
    } : null
  }));

  const serializedPendingBlocks = pendingBlocks.map((b) => ({
    id: b.id,
    blockNumber: b.block_number,
    status: b.status,
    quantity: b.quantity,
    requestedBy: b.requestedBy,
    remarks: b.remarks,
    createdAt: b.createdAt.toISOString(),
    dealer: b.dealer ? {
      name: b.dealer.name,
      company: b.dealer.company
    } : null
  }));

  return (
    <DashboardClient
      summary={summary}
      recentMovements={serializedMovements}
      pendingBlocks={serializedPendingBlocks}
      session={session}
    />
  );
}
