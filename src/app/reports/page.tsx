import { db } from "@/lib/db";
import { ReportsClient } from "@/app/reports/ReportsClient";

export const revalidate = 0;

export default async function ReportsPage() {
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
          <h1 className="text-2xl font-bold tracking-tight text-white">Inventory Reports & Export</h1>
          <p className="text-xs text-slate-400">
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
