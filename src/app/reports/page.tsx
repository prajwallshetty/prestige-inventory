import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";
import { FileSpreadsheet, Download, Filter } from "lucide-react";

export const revalidate = 0;

export default async function ReportsPage() {
  const [totalInventory, stockBlocks, movements, shipments] = await Promise.all([
    db.inventory.count(),
    db.stockBlock.count(),
    db.inventoryMovement.count(),
    db.shipment.count(),
  ]);

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Inventory Reports & Export</h1>
          <p className="text-xs text-slate-400">
            Generate and export real-time audit logs, stock movement summaries, dealer block reports, and transit logs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportCard title="Total Stock Items" count={totalInventory} type="Inventory Report" />
          <ReportCard title="Stock Blocks" count={stockBlocks} type="Blocks Report" />
          <ReportCard title="Stock Movements" count={movements} type="Movement Audit Log" />
          <ReportCard title="In-Transit Shipments" count={shipments} type="Shipments Report" />
        </div>
      </div>
    </SidebarLayout>
  );
}

function ReportCard({ title, count, type }: any) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <FileSpreadsheet className="h-6 w-6 text-blue-400" />
        <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">{type}</span>
      </div>
      <h3 className="mt-3 text-sm font-bold text-white">{title}</h3>
      <p className="text-xs text-slate-400 mt-1">{count} total records</p>
      <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all">
        <Download className="h-3.5 w-3.5" /> Export Data (CSV)
      </button>
    </div>
  );
}
