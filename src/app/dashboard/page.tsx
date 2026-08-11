import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { getInventorySummary } from "@/services/InventoryService";
import { getSessionContext } from "@/lib/session";
import { db } from "@/lib/db";
import { DashboardClient } from "./DashboardClient";

export const revalidate = 0; // Dynamic server-side rendering

export default async function DashboardPage() {
  const session = await getSessionContext();
  const summary = await getInventorySummary();

  // Fetch recent stock movements
  const recentMovements = await db.inventoryMovement.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: {
      inventory: {
        include: {
          product: { select: { name: true, sku: true, size: true } },
        },
      },
    },
  });

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
        sku: m.inventory.product.sku || m.inventory.productId.slice(-6).toUpperCase(),
        size: m.inventory.product.size || "Standard",
      }
    } : null
  }));

  // Fetch active pending blocks (for manager alerts)
  const pendingBlocks = await db.stockBlock.findMany({
    where: { status: "PENDING" },
    take: 5,
    include: {
      dealer: { select: { name: true, company: true } },
    },
  });

  const serializedPendingBlocks = pendingBlocks.map((b) => ({
    id: b.id,
    quantity: b.quantity,
    requestedBy: b.requestedBy,
    remarks: b.remarks,
    createdAt: b.createdAt.toISOString(),
    dealer: b.dealer ? {
      name: b.dealer.name,
      company: b.dealer.company
    } : null
  }));

  // Dealer portal metrics
  let dealerBookings: any[] = [];
  let dealerSummary = { pendingCount: 0, awaitingConfirmCount: 0, confirmedCount: 0, totalBoxes: 0 };

  if (session.role === "DEALER" && session.dealerId) {
    const bookings = await db.stockBooking.findMany({
      where: { dealerId: session.dealerId },
      orderBy: { requestedAt: "desc" },
      take: 5,
      include: {
        items: { select: { requestedQuantity: true } }
      }
    });

    dealerBookings = bookings.map((b) => ({
      id: b.id,
      bookingNumber: b.bookingNumber,
      status: b.status,
      requestedAt: b.requestedAt.toISOString(),
      items: b.items.map((i) => ({
        requestedQuantity: i.requestedQuantity
      }))
    }));

    const [pending, awaiting, confirmed] = await Promise.all([
      db.stockBooking.count({ where: { dealerId: session.dealerId, status: "PENDING_APPROVAL" } }),
      db.stockBooking.count({ where: { dealerId: session.dealerId, status: "AWAITING_DEALER_CONFIRMATION" } }),
      db.stockBooking.count({ where: { dealerId: session.dealerId, status: "CONFIRMED" } }),
    ]);

    const itemsSum = await db.stockBookingItem.aggregate({
      where: { 
        booking: { 
          dealerId: session.dealerId, 
          status: { in: ["APPROVED", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED", "ALLOCATED", "FULFILLED"] } 
        } 
      },
      _sum: { approvedQuantity: true }
    });

    dealerSummary = {
      pendingCount: pending,
      awaitingConfirmCount: awaiting,
      confirmedCount: confirmed,
      totalBoxes: itemsSum._sum.approvedQuantity || 0
    };
  }

  return (
    <SidebarLayout>
      <DashboardClient
        summary={summary}
        recentMovements={serializedMovements}
        pendingBlocks={serializedPendingBlocks}
        dealerBookings={dealerBookings}
        dealerSummary={dealerSummary}
        session={session}
      />
    </SidebarLayout>
  );
}
