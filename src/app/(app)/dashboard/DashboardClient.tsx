"use client";

import React from "react";
import Link from "next/link";
import {
  Boxes,
  PackageCheck,
  Lock,
  Truck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { SessionContext } from "@/lib/session";

/**
 * `toLocaleTimeString`/`toLocaleDateString` with no explicit locale/timeZone
 * resolve to the running engine's default — server (SSR) and browser
 * (hydration) usually disagree, producing a React hydration text mismatch
 * (error #418) on every dashboard load. Pinning both makes SSR and the
 * client compute the identical string.
 */
function formatIST(value: string | Date, opts: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleString("en-IN", { ...opts, timeZone: "Asia/Kolkata" });
}

interface Props {
  summary: {
    totalProducts: number;
    totalAvailableStock: number;
    totalBlockedStock: number;
    totalInTransit: number;
    lowStock: number;
    outOfStock: number;
    activeBlocks: number;
    pendingBlocks: number;
    stockDetails?: {
      available: { box: number; pc: number; bag: number };
      blocked: { box: number; pc: number; bag: number };
      transit: { box: number; pc: number; bag: number };
      total: { box: number; pc: number; bag: number };
    };
  };
  recentMovements: any[];
  pendingBlocks: any[];
  session: SessionContext;
}

export function DashboardClient({
  summary,
  recentMovements,
  pendingBlocks,
  session
}: Props) {
  const getOperationalAlerts = () => {
    const alerts = [];
    if (summary.pendingBlocks > 0) {
      alerts.push({
        id: "alert-blocks",
        type: "PENDING",
        label: `${summary.pendingBlocks} block request(s) waiting for approval`,
        actionText: "Review",
        actionUrl: "/bookings",
      });
    }
    if (summary.lowStock > 0) {
      alerts.push({
        id: "alert-low",
        type: "LOW STOCK",
        label: `${summary.lowStock} products below reorder level`,
        actionText: "View Stock",
        actionUrl: "/inventory?status=LOW_STOCK",
      });
    }
    if (pendingBlocks.length > 0) {
      alerts.push({
        id: "alert-pending-block",
        type: "URGENT",
        label: `${pendingBlocks.length} block request(s) awaiting review`,
        actionText: "Review Blocks",
        actionUrl: "/blocks",
      });
    }
    return alerts;
  };

  const operationalAlerts = getOperationalAlerts();

  return (
    <div className="space-y-6">
      {/* Master Manager Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#111111] tracking-tight sm:text-2xl">
            Good morning, Inventory Manager
          </h1>
          <p className="text-xs text-[#6B6B6B]">
            Monitor live stock balances, verify dealer holds, and oversee logistics dispatch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Only Super Admin may open /admin/product-types (middleware
              SECTION_ACCESS) — showing this to every role always 403'd for
              everyone else (route audit finding). */}
          {session.role === "SUPER_ADMIN" && (
            <Link
              href="/admin/product-types"
              className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-bold text-[#111111] hover:bg-[#F7F7F5] transition-all flex items-center gap-1.5 touch-target shadow-xs"
            >
              <Boxes className="h-3.5 w-3.5 text-indigo-600" /> Categories & Types
            </Link>
          )}
          <Link
            href="/bookings"
            className="rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-[#D8AD02] transition-all flex items-center gap-1.5 touch-target"
          >
            <Plus className="h-4 w-4" /> Review Queue
          </Link>
          <Link
            href="/transit"
            className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] transition-all touch-target"
          >
            Track Incoming Transit
          </Link>
        </div>
      </div>

      {/* OPERATIONAL ALERTS BOARD */}
      {operationalAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            <span>Operational Alert Center</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {operationalAlerts.map((alert) => (
              <div 
                key={alert.id} 
                className="rounded-lg border border-[#EAEAEA] bg-white p-3.5 flex flex-col justify-between gap-3 shadow-xs hover:border-slate-300 transition-all"
              >
                <div>
                  <span className="rounded bg-rose-50 border border-rose-100 px-1.5 py-0.5 text-[8.5px] font-bold text-rose-700 uppercase tracking-wider">
                    {alert.type}
                  </span>
                  <p className="text-xs text-[#111111] mt-2 font-medium leading-snug">{alert.label}</p>
                </div>
                <Link
                  href={alert.actionUrl}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8A7300] hover:text-[#D8AD02] transition-colors w-max"
                >
                  {alert.actionText} <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METRICS GRID */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard title="Total Catalog Products" value={summary.totalProducts.toLocaleString("en-IN")} icon={Boxes} color="blue" />
        <MetricCard 
          title="Available Stock" 
          value={(() => {
            const d = summary.stockDetails?.available;
            if (!d) return `${summary.totalAvailableStock.toLocaleString("en-IN")} Box`;
            const parts = [];
            if (d.box > 0) parts.push(`${d.box.toLocaleString("en-IN")} Box`);
            if (d.pc > 0) parts.push(`${d.pc.toLocaleString("en-IN")} Pc`);
            if (d.bag > 0) parts.push(`${d.bag.toLocaleString("en-IN")} Bag`);
            return parts.length > 0 ? parts.join(" • ") : "0 Box";
          })()} 
          icon={PackageCheck} 
          color="emerald" 
        />
        <MetricCard 
          title="Blocked Hold" 
          value={(() => {
            const d = summary.stockDetails?.blocked;
            if (!d) return `${summary.totalBlockedStock.toLocaleString("en-IN")} Box`;
            const parts = [];
            if (d.box > 0) parts.push(`${d.box.toLocaleString("en-IN")} Box`);
            if (d.pc > 0) parts.push(`${d.pc.toLocaleString("en-IN")} Pc`);
            if (d.bag > 0) parts.push(`${d.bag.toLocaleString("en-IN")} Bag`);
            return parts.length > 0 ? parts.join(" • ") : "0 Box";
          })()} 
          icon={Lock} 
          color="amber" 
        />
        <MetricCard 
          title="Transit Stock" 
          value={(() => {
            const d = summary.stockDetails?.transit;
            if (!d) return `${summary.totalInTransit.toLocaleString("en-IN")} Box`;
            const parts = [];
            if (d.box > 0) parts.push(`${d.box.toLocaleString("en-IN")} Box`);
            if (d.pc > 0) parts.push(`${d.pc.toLocaleString("en-IN")} Pc`);
            if (d.bag > 0) parts.push(`${d.bag.toLocaleString("en-IN")} Bag`);
            return parts.length > 0 ? parts.join(" • ") : "0 Box";
          })()} 
          icon={Truck} 
          color="indigo" 
        />
        <MetricCard title="Low / Out stock" value={`${summary.lowStock} / ${summary.outOfStock}`} icon={AlertTriangle} color="rose" />
      </div>

      {/* LAYOUT GRID */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT MOVEMENTS LOG */}
        <div className="lg:col-span-2 rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
            <div>
              <h2 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Stock Movement Ledger</h2>
            </div>
            <Link href="/reports" className="text-[10px] font-bold text-[#8A7300] hover:underline">
              View Log →
            </Link>
          </div>

          <div className="divide-y divide-[#EAEAEA]">
            {recentMovements.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#6B6B6B]">No stock movements recorded today.</p>
            ) : (
              recentMovements.map((mov) => {
                const prod = mov.inventory?.product;
                const isPositive = mov.quantity > 0;
                return (
                  <div key={mov.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isPositive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#111111]">
                          {prod?.name || "Product"}
                        </p>
                        <p className="text-[10px] text-[#6B6B6B] mt-0.5">
                          {mov.movementType} • Reason: {mov.reason || "Audit"} • By {mov.performedBy}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${isPositive ? "text-emerald-700" : "text-rose-700"}`}>
                        {isPositive ? `+${mov.quantity}` : mov.quantity} Boxes
                      </p>
                      <p className="text-[9px] text-[#6B6B6B] mt-0.5" suppressHydrationWarning>
                        {formatIST(mov.createdAt, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* PENDING ACTIONS (DEALER BLOCKS QUEUE) */}
        <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
            <div>
              <h2 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Pending Block Requests</h2>
            </div>
            <Link href="/blocks" className="text-[10px] font-bold text-[#8A7300] hover:underline">
              View All →
            </Link>
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {pendingBlocks.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#6B6B6B] italic">All block approval requests processed.</p>
            ) : (
              pendingBlocks.map((block) => (
                <div key={block.id} className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-bold text-[#111111]">{block.dealer?.name || "Internal Hold"}</p>
                    <span className="shrink-0 rounded bg-amber-100 border border-amber-200 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                      {block.quantity} Boxes
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {block.blockNumber && (
                      <span className="rounded bg-white border border-[#EAEAEA] px-1.5 py-0.5 font-mono text-[9px] text-[#6B6B6B]">
                        {block.blockNumber}
                      </span>
                    )}
                    {/* Which desk it is sitting on — In-Charge or Manager. */}
                    <span className="rounded bg-white border border-[#EAEAEA] px-1.5 py-0.5 text-[9px] font-bold text-[#6B6B6B]">
                      {block.status === "PENDING_INCHARGE_APPROVAL" ? "Awaiting In-Charge" : "Awaiting Manager"}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6B6B6B]">
                    Requested by: <strong>{block.requestedBy}</strong>
                  </p>
                  {block.remarks && <p className="text-[10px] text-[#6B6B6B] italic">"{block.remarks}"</p>}
                  <Link
                    href={`/blocks/${block.id}`}
                    className="flex min-h-[36px] w-full items-center justify-center rounded bg-white text-center text-[10px] font-black text-[#111111] hover:bg-[#F7F7F5] border border-[#EAEAEA]"
                  >
                    Review Hold Request
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-600",
    rose: "border-rose-100 bg-rose-50 text-rose-600",
  };

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-black text-[#6B6B6B] uppercase tracking-widest leading-normal">{title}</span>
        <div className={`rounded-lg border p-1.5 ${colorMap[color]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div>
        <p className="text-lg font-black tracking-tight text-[#111111]">{value}</p>
      </div>
    </div>
  );
}
