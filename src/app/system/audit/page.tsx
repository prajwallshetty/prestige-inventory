import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";

export const revalidate = 0;

export default async function AuditLogPage() {
  const auditMovements = await db.inventoryMovement.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      inventory: {
        include: {
          product: { select: { name: true, sku: true, productCode: true } },
        },
      },
    },
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Inventory Audit Trail</h1>
          <p className="text-xs text-slate-400">
            Immutable log of all stock movements, manual adjustments, block approvals, and receiving operations.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Movement Type</th>
                <th className="px-4 py-3.5">Product SKU / Name</th>
                <th className="px-4 py-3.5 text-right">Qty Changed</th>
                <th className="px-4 py-3.5 text-right">Prev → New</th>
                <th className="px-4 py-3.5">Reason / Ref</th>
                <th className="px-4 py-3.5">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
              {auditMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No movements recorded in audit history yet.
                  </td>
                </tr>
              ) : (
                auditMovements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {new Date(mov.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-400">{mov.movementType}</td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {mov.inventory?.product?.sku || mov.inventory?.product?.name || "Product"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono">
                      {mov.previousQuantity} → {mov.newQuantity}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{mov.reason || "N/A"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-300">{mov.performedBy}</td>
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
