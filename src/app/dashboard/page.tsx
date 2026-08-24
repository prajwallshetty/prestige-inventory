import { redirect } from "next/navigation";
import { getInventorySummary } from "@/services/InventoryService";
import { getSessionContext } from "@/lib/session";
import { PENDING_BLOCK_STATUSES } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DashboardClient } from "@/app/dashboard/DashboardClient";

export const revalidate = 0; // Dynamic server-side rendering

export default async function DashboardPage() {
  // Session is cookie-only (no DB round trip), so it can gate the dealer
  // queries without costing latency.
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  // The DEALER login role was retired; dealer-scoped dashboard queries no
  // longer apply to any signed-in role.
  const isDealer = false;

  // Every independent read goes out in ONE parallel batch. The database is
  // geographically remote (~1.5s per round trip), so awaiting these in
  // sequence costs seconds of pure network wait — parallel is ~7x faster.
  const [
    summary,
    recentMovements,
    pendingBlocks,
    dealerBookingsRaw,
    dealerPending,
    dealerAwaiting,
    dealerConfirmed,
    dealerItemsSum,
  ] = await Promise.all([
    getInventorySummary(),
    db.inventoryMovement.findMany({
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
      where: { status: { in: [...PENDING_BLOCK_STATUSES] } },
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
    isDealer
      ? db.stockBooking.findMany({
          where: { dealerId: session.dealerId },
          orderBy: { requestedAt: "desc" },
          take: 5,
          include: { items: { select: { requestedQuantity: true } } },
        })
      : Promise.resolve([]),
    isDealer
      ? db.stockBooking.count({ where: { dealerId: session.dealerId, status: "PENDING_APPROVAL" } })
      : Promise.resolve(0),
    isDealer
      ? db.stockBooking.count({ where: { dealerId: session.dealerId, status: "AWAITING_DEALER_CONFIRMATION" } })
      : Promise.resolve(0),
    isDealer
      ? db.stockBooking.count({ where: { dealerId: session.dealerId, status: "CONFIRMED" } })
      : Promise.resolve(0),
    isDealer
      ? db.stockBookingItem.aggregate({
          where: {
            booking: {
              dealerId: session.dealerId,
              status: { in: ["APPROVED", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED", "ALLOCATED", "FULFILLED"] },
            },
          },
          _sum: { approvedQuantity: true },
        })
      : Promise.resolve(null),
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

  // Dealer portal metrics — the underlying queries already ran in the batch
  // above (resolving to empty/zero for non-dealers), so this is pure shaping.
  const dealerBookings = dealerBookingsRaw.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    requestedAt: b.requestedAt.toISOString(),
    items: b.items.map((i) => ({
      requestedQuantity: i.requestedQuantity,
    })),
  }));

  const dealerSummary = {
    pendingCount: dealerPending,
    awaitingConfirmCount: dealerAwaiting,
    confirmedCount: dealerConfirmed,
    totalBoxes: dealerItemsSum?._sum.approvedQuantity || 0,
  };

  return (
    <>
      <DashboardClient
        summary={summary}
        recentMovements={serializedMovements}
        pendingBlocks={serializedPendingBlocks}
        dealerBookings={dealerBookings}
        dealerSummary={dealerSummary}
        session={session}
      />
    </>
  );
}
