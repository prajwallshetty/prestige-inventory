import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InTransitPage() {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  const shipments = await db.shipment.findMany({
    include: {
      warehouse: { select: { name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#111111]">In-Transit & Incoming Logistics</h1>
            <p className="text-xs text-[#6B6B6B]">
              Track factory dispatch orders, calculate short/damaged shipments upon arrival, and update live available inventory.
            </p>
          </div>
        </div>

        {/* Scrolls within its own container so the page body never does (§26). */}
        <div className="overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Shipment #</th>
                <th className="px-4 py-3.5">Supplier</th>
                <th className="px-4 py-3.5">Destination Warehouse</th>
                <th className="px-4 py-3.5 text-right">Items Count</th>
                <th className="px-4 py-3.5">Expected Date</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#6B6B6B]">
                    No shipments currently recorded in transit.
                  </td>
                </tr>
              ) : (
                shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[#111111]">{shipment.shipmentNumber}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{shipment.supplier || "Factory Supplier"}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{shipment.warehouse?.name || "Main Central Depot"}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">{shipment.items.length} Products</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">
                      {shipment.expectedDate
                        ? new Date(shipment.expectedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                        : "Pending"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-bold">
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
    </>
  );
}
