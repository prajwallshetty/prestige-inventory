import { SidebarLayout } from "@/components/layout/SidebarLayout";
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
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Warehouses & Central Depots</h1>
          <p className="text-xs text-slate-400">
            Multi-depot storage locations, current stocking levels, and incoming shipment hubs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((wh) => (
            <div key={wh.id} className="rounded-xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
                    <WarehouseIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{wh.name}</h3>
                    <p className="text-[10px] font-mono text-slate-400">{wh.code}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                  {wh.status}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Location:</span>
                  <span className="font-medium text-white">{wh.location || "Mangalore Central"}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Stock Items Managed:</span>
                  <span className="font-bold text-emerald-400">{wh.inventories.length} Products</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Active Shipments:</span>
                  <span className="font-bold text-indigo-400">{wh.shipments.length} Incoming</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
