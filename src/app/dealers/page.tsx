import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";

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
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Dealer Management</h1>
          <p className="text-xs text-[#6B6B6B]">
            Registered tile dealers, active reservations, and block history.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Dealer Name</th>
                <th className="px-4 py-3.5">Company</th>
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-4 py-3.5 text-right">Active Reservations</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
              {dealers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#6B6B6B]">
                    No dealers registered yet. Stock blocks can be created directly by sales reps.
                  </td>
                </tr>
              ) : (
                dealers.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[#111111]">{d.name}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{d.company || "—"}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{d.phone || d.contact || "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#8A7300]">{d.stockBlocks.length} Blocks</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
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
