import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { canViewAuditLogs, type Role } from "@/lib/permissions";

export const revalidate = 0;

export default async function AuditLogPage() {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");
  if (!canViewAuditLogs(session.role as Role)) redirect("/dashboard");

  const auditMovements = await db.inventoryMovement.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      movementType: true,
      quantity: true,
      previousQuantity: true,
      newQuantity: true,
      reason: true,
      performedBy: true,
      inventory: {
        select: {
          product: { select: { name: true, sku: true, productCode: true } },
        },
      },
    },
  });

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Inventory Audit Trail</h1>
          <p className="text-xs text-[#6B6B6B]">
            Immutable log of all stock movements, manual adjustments, block approvals, and receiving operations.
          </p>
        </div>

        {/* Scrolls within its own container so the page body never does (§26). */}
        <div className="overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
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
            <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
              {auditMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#6B6B6B]">
                    No movements recorded in audit history yet.
                  </td>
                </tr>
              ) : (
                auditMovements.map((mov) => {
                  const isPositive = mov.quantity > 0;
                  return (
                    <tr key={mov.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                      <td className="px-4 py-3 text-[#6B6B6B] font-mono text-[11px]">
                        {new Date(mov.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-600">{mov.movementType}</td>
                      <td className="px-4 py-3 font-semibold text-[#111111]">
                        {mov.inventory?.product?.sku || mov.inventory?.product?.name || "Product"}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                        {isPositive ? `+${mov.quantity}` : mov.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-[#6B6B6B] font-mono">
                        {mov.previousQuantity} → {mov.newQuantity}
                      </td>
                      <td className="px-4 py-3 text-[#6B6B6B]">{mov.reason || "N/A"}</td>
                      <td className="px-4 py-3 font-semibold text-[#111111]">{mov.performedBy}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
