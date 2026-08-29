import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { ReportsClient } from "@/app/(app)/reports/ReportsClient";

export const revalidate = 0;

export default async function ReportsPage() {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  const [totalInventory, stockBlocks, stockBookings, movements] = await Promise.all([
    db.inventory.count(),
    db.stockBlock.count(),
    db.stockBooking.count(),
    db.inventoryMovement.count(),
  ]);

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Inventory Reports & Export</h1>
          <p className="text-xs text-[#6B6B6B]">
            Generate and export real-time audit logs, stock movements, dealer holds, and bookings to CSV.
          </p>
        </div>

        <ReportsClient
          totalInventory={totalInventory}
          stockBlocks={stockBlocks}
          stockBookings={stockBookings}
          movements={movements}
        />
      </div>
    </>
  );
}
