import { db } from "@/lib/db";
import { Warehouse as WarehouseIcon } from "lucide-react";

export const revalidate = 0;

export default async function WarehousesPage() {
  const warehouses = await db.warehouse.findMany({
    include: {
      inventories: true,
      shipments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Warehouses & Central Depots</h1>
          <p className="text-xs text-[#6B6B6B]">
            Multi-depot storage locations, current stocking levels, and incoming shipment hubs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((wh) => (
            <div key={wh.id} className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                    <WarehouseIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#111111]">{wh.name}</h3>
                    <p className="text-[10px] font-mono text-[#6B6B6B]">{wh.code}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                  {wh.status}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between text-[#6B6B6B]">
                  <span>Location:</span>
                  <span className="font-medium text-[#111111]">{wh.location || "Mangalore Central"}</span>
                </div>
                <div className="flex justify-between text-[#6B6B6B]">
                  <span>Stock Items Managed:</span>
                  <span className="font-bold text-emerald-600">{wh.inventories.length} Products</span>
                </div>
                <div className="flex justify-between text-[#6B6B6B]">
                  <span>Active Shipments:</span>
                  <span className="font-bold text-indigo-600">{wh.shipments.length} Incoming</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
