import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";
import { Truck, Calendar, PackageCheck, AlertCircle } from "lucide-react";

export const revalidate = 0;

export default async function InTransitPage() {
  const shipments = await db.shipment.findMany({
    include: {
      warehouse: { select: { name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">In-Transit & Incoming Logistics</h1>
            <p className="text-xs text-slate-400">
              Track factory dispatch orders, calculate short/damaged shipments upon arrival, and update live available inventory.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Shipment #</th>
                <th className="px-4 py-3.5">Supplier</th>
                <th className="px-4 py-3.5">Destination Warehouse</th>
                <th className="px-4 py-3.5 text-right">Items Count</th>
                <th className="px-4 py-3.5">Expected Date</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No shipments currently recorded in transit.
                  </td>
                </tr>
              ) : (
                shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">{shipment.shipmentNumber}</td>
                    <td className="px-4 py-3 text-slate-300">{shipment.supplier || "Factory Supplier"}</td>
                    <td className="px-4 py-3 text-slate-300">{shipment.warehouse?.name || "Main Central Depot"}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-400">{shipment.items.length} Products</td>
                    <td className="px-4 py-3 text-slate-400">
                      {shipment.expectedDate
                        ? new Date(shipment.expectedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                        : "Pending"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold">
                        {shipment.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SidebarLayout>
  );
}
