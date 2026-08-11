"use client";

import React, { useState } from "react";
import { FileSpreadsheet, Download } from "lucide-react";
import { 
  getInventoryReportDataAction, 
  getBlocksReportDataAction, 
  getBookingsReportDataAction, 
  getMovementsReportDataAction 
} from "@/app/actions";

interface Props {
  totalInventory: number;
  stockBlocks: number;
  stockBookings: number;
  movements: number;
}

export function ReportsClient({ totalInventory, stockBlocks, stockBookings, movements }: Props) {
  const [exporting, setExporting] = useState<string | null>(null);

  // General CSV download function
  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${(val || "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async (type: "inventory" | "blocks" | "bookings" | "movements") => {
    setExporting(type);
    try {
      if (type === "inventory") {
        const data = await getInventoryReportDataAction();
        const headers = ["Inventory ID", "Product Name", "SKU", "Size", "Brand", "Warehouse Code", "Available Stock", "Blocked Stock", "Transit Stock", "Damaged Stock", "Status"];
        const rows = data.map((item) => [
          item.id,
          item.product?.name || "",
          item.product?.sku || "",
          item.product?.size || "",
          item.product?.brand?.name || "",
          item.warehouse?.code || "",
          item.availableStock.toString(),
          item.blockedStock.toString(),
          item.transitStock.toString(),
          item.damagedStock.toString(),
          item.stockStatus,
        ]);
        downloadCsv(`prestige-inventory-report-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
      } else if (type === "blocks") {
        const data = await getBlocksReportDataAction();
        const headers = ["Block ID", "Product Name", "SKU", "Dealer Name", "Quantity", "Status", "Requested By", "Expires At", "Created At"];
        const rows = data.map((item) => [
          item.id,
          item.inventory?.product?.name || "",
          item.inventory?.product?.sku || "",
          item.dealer?.name || "Internal Hold",
          item.quantity.toString(),
          item.status,
          item.requestedBy,
          item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "Never",
          new Date(item.createdAt).toLocaleString(),
        ]);
        downloadCsv(`prestige-stock-blocks-report-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
      } else if (type === "bookings") {
        const data = await getBookingsReportDataAction();
        const headers = ["Booking ID", "Booking Number", "Dealer Name", "Warehouse Name", "Status", "Priority", "Requested By", "Expires At", "Created At", "Products List"];
        const rows = data.map((item) => [
          item.id,
          item.bookingNumber,
          item.dealer?.name || "",
          item.warehouse?.name || "",
          item.status,
          item.priority,
          item.requestedBy,
          item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "Never",
          new Date(item.createdAt).toLocaleString(),
          item.items.map(i => `${i.product?.name} (x${i.requestedQuantity})`).join(" | "),
        ]);
        downloadCsv(`prestige-stock-bookings-report-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
      } else if (type === "movements") {
        const data = await getMovementsReportDataAction();
        const headers = ["Movement ID", "Product SKU", "Product Name", "Warehouse Name", "Movement Type", "Qty Moved", "Previous Qty", "New Qty", "Reason", "Performed By", "Timestamp"];
        const rows = data.map((item) => [
          item.id,
          item.inventory?.product?.sku || "",
          item.inventory?.product?.name || "",
          item.warehouse?.name || "",
          item.movementType,
          item.quantity.toString(),
          item.previousQuantity.toString(),
          item.newQuantity.toString(),
          item.reason || "",
          item.performedBy,
          new Date(item.createdAt).toLocaleString(),
        ]);
        downloadCsv(`prestige-stock-movements-trail-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* INVENTORY STOCK LEVEL CARD */}
      <ReportCard
        title="Stock Level Inventory"
        count={totalInventory}
        type="Inventory Report"
        isExporting={exporting === "inventory"}
        onExport={() => handleExport("inventory")}
      />

      {/* STOCK RESERVATION HOLD CARD */}
      <ReportCard
        title="Stock Holdings (Blocks)"
        count={stockBlocks}
        type="Blocks Report"
        isExporting={exporting === "blocks"}
        onExport={() => handleExport("blocks")}
      />

      {/* STOCK BOOKINGS REPORT */}
      <ReportCard
        title="Multi-Product Bookings"
        count={stockBookings}
        type="Bookings Report"
        isExporting={exporting === "bookings"}
        onExport={() => handleExport("bookings")}
      />

      {/* STOCK MOVEMENT TRAIL */}
      <ReportCard
        title="Stock Movements Audit Trail"
        count={movements}
        type="Movements Log"
        isExporting={exporting === "movements"}
        onExport={() => handleExport("movements")}
      />
    </div>
  );
}

function ReportCard({ title, count, type, isExporting, onExport }: { title: string; count: number; type: string; isExporting: boolean; onExport: () => void }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl transition-all hover:scale-102 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <FileSpreadsheet className="h-6 w-6 text-amber-500" />
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 uppercase tracking-wider">
            {type}
          </span>
        </div>
        <h3 className="mt-4 text-sm font-bold text-white tracking-tight">{title}</h3>
        <p className="text-[11px] text-slate-400 mt-1">{count} total records available</p>
      </div>

      <button
        onClick={onExport}
        disabled={isExporting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-750 disabled:bg-slate-850 disabled:text-slate-500 transition-all border border-slate-750 shadow-md"
      >
        <Download className="h-3.5 w-3.5" /> 
        {isExporting ? "Exporting CSV..." : "Export Data (CSV)"}
      </button>
    </div>
  );
}
