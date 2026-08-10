import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";
import { Users } from "lucide-react";

export const revalidate = 0;

export default async function DealersPage() {
  const dealers = await db.dealer.findMany({
    include: {
      stockBlocks: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dealer Management</h1>
          <p className="text-xs text-slate-400">
            Registered tile dealers, active reservations, and block history.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Dealer Name</th>
                <th className="px-4 py-3.5">Company</th>
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-4 py-3.5 text-right">Active Reservations</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
              {dealers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    No dealers registered yet. Stock blocks can be created directly by sales reps.
                  </td>
                </tr>
              ) : (
                dealers.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">{d.name}</td>
                    <td className="px-4 py-3 text-slate-300">{d.company || "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{d.phone || d.contact || "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-400">{d.stockBlocks.length} Blocks</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                        {d.status}
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
