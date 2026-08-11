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
  Sliders, 
  Plus, 
  FileText, 
  ChevronRight,
  Clock,
  Sparkles,
  Inbox,
  AlertCircle,
  Store
} from "lucide-react";
import { SessionContext } from "@/lib/session";

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
  };
  recentMovements: any[];
  pendingBlocks: any[];
  dealerBookings: any[];
  dealerSummary: {
    pendingCount: number;
    awaitingConfirmCount: number;
    confirmedCount: number;
    totalBoxes: number;
  };
  session: SessionContext;
}

export function DashboardClient({ 
  summary, 
  recentMovements, 
  pendingBlocks, 
  dealerBookings, 
  dealerSummary,
  session 
}: Props) {
  const isDealer = session.role === "DEALER";

  // Build operational alerts for Managers/Admins
  const getOperationalAlerts = () => {
    const alerts = [];
    if (summary.pendingBlocks > 0) {
      alerts.push({
        id: "alert-blocks",
        type: "PENDING",
        label: `${summary.pendingBlocks} dealer bookings waiting for approval`,
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
        label: `${pendingBlocks.length} dealer block requests awaiting review`,
        actionText: "Review Blocks",
        actionUrl: "/blocks",
      });
    }
    return alerts;
  };

  const operationalAlerts = getOperationalAlerts();

  if (isDealer) {
    return (
      <div className="space-y-6">
        {/* Dealer Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            Good morning, Dealer Partner
          </h1>
          <p className="text-xs text-slate-400">
            Request stock holds, monitor reservation timers, and confirm approved bookings.
          </p>
        </div>

        {/* Dealer Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[#1b253b]/45 bg-[#0c1122] p-4 shadow-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Active Reserves</span>
            <p className="text-xl font-bold text-white tracking-tight mt-1">{dealerSummary.totalBoxes.toLocaleString()}</p>
            <span className="text-[9px] text-slate-450 mt-1 block">Total boxes reserved</span>
          </div>

          <div className="rounded-xl border border-[#1b253b]/45 bg-[#0c1122] p-4 shadow-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Awaiting Confirm</span>
            <p className="text-xl font-bold text-amber-400 tracking-tight mt-1">{dealerSummary.awaitingConfirmCount}</p>
            <span className="text-[9px] text-slate-450 mt-1 block">Action required</span>
          </div>

          <div className="rounded-xl border border-[#1b253b]/45 bg-[#0c1122] p-4 shadow-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Pending Approval</span>
            <p className="text-xl font-bold text-blue-400 tracking-tight mt-1">{dealerSummary.pendingCount}</p>
            <span className="text-[9px] text-slate-455 mt-1 block">Hold requests queued</span>
          </div>

          <div className="rounded-xl border border-[#1b253b]/45 bg-[#0c1122] p-4 shadow-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Confirmed Holds</span>
            <p className="text-xl font-bold text-emerald-400 tracking-tight mt-1">{dealerSummary.confirmedCount}</p>
            <span className="text-[9px] text-slate-450 mt-1 block">Stock locked in warehouse</span>
          </div>
        </div>

        {/* Action Required Banner */}
        {dealerSummary.awaitingConfirmCount > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-white">Action Required: Pending Confirmations</p>
                <p className="text-slate-400">You have {dealerSummary.awaitingConfirmCount} approved bookings that will expire if not confirmed.</p>
              </div>
            </div>
            <Link
              href="/bookings"
              className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-[10px] font-black text-slate-950 hover:bg-amber-400 whitespace-nowrap transition-all"
            >
              Confirm Now
            </Link>
          </div>
        )}

        {/* Dealer Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/bookings/new"
            className="rounded-xl border border-[#1b253b]/55 bg-[#0e1424] p-4 flex items-center justify-between hover:border-slate-700 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-400">
                <Store className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">Request New Hold</p>
                <p className="text-[10px] text-slate-400 hidden sm:block">Book tile stock directly from depot</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Link>

          <Link
            href="/inventory"
            className="rounded-xl border border-[#1b253b]/55 bg-[#0e1424] p-4 flex items-center justify-between hover:border-slate-700 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
                <Boxes className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">Browse Products</p>
                <p className="text-[10px] text-slate-400 hidden sm:block">Check live catalog available quantities</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Link>
        </div>

        {/* Recent Reservations */}
        <div className="rounded-xl border border-slate-800 bg-[#0c1122] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-4">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Recent Reservation Holds</h2>
            </div>
            <Link href="/bookings" className="text-[10px] font-bold text-amber-500 hover:underline">
              View All Holds →
            </Link>
          </div>

          <div className="divide-y divide-slate-850">
            {dealerBookings.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <Inbox className="h-8 w-8 text-slate-650" />
                <p>No active reservations yet. Click "Request New Hold" to begin.</p>
              </div>
            ) : (
              dealerBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-3.5">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white font-mono">{b.bookingNumber}</p>
                    <p className="text-[10px] text-slate-450">
                      {new Date(b.requestedAt).toLocaleDateString()} • {b.items.length} Products ({b.items.reduce((sum: number, i: any) => sum + i.requestedQuantity, 0)} boxes)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[9px] font-black text-slate-350 uppercase">
                      {b.status.replace(/_/g, " ")}
                    </span>
                    <Link
                      href={`/bookings/${b.id}`}
                      className="rounded bg-slate-800 border border-slate-750 px-2.5 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-700"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master Manager Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            Good morning, Inventory Manager
          </h1>
          <p className="text-xs text-slate-450">
            Monitor live stock balances, verify dealer holds, and oversee logistics dispatch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/bookings"
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md hover:bg-amber-400 transition-all flex items-center gap-1.5 touch-target"
          >
            <Plus className="h-4 w-4" /> Review Queue
          </Link>
          <Link
            href="/in-transit"
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-250 hover:bg-slate-800 transition-all touch-target"
          >
            Receive Shipment
          </Link>
        </div>
      </div>

      {/* OPERATIONAL ALERTS BOARD */}
      {operationalAlerts.length > 0 && (
        <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-4 space-y-3">
          <h3 className="text-[10px] font-black text-slate-550 uppercase tracking-widest flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span>Operational Alert Center</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {operationalAlerts.map((alert) => (
              <div 
                key={alert.id} 
                className="rounded-lg border border-slate-850 bg-[#0c1122]/90 p-3.5 flex flex-col justify-between gap-3 shadow-sm hover:border-slate-750 transition-all"
              >
                <div>
                  <span className="rounded bg-rose-500/10 border border-rose-500/15 px-1.5 py-0.5 text-[8.5px] font-bold text-rose-400 uppercase tracking-wider">
                    {alert.type}
                  </span>
                  <p className="text-xs text-slate-200 mt-2 font-medium leading-snug">{alert.label}</p>
                </div>
                <Link
                  href={alert.actionUrl}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 hover:text-amber-400 transition-colors w-max"
                >
                  {alert.actionText} <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METRICS GRID */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard title="Total Catalog Products" value={summary.totalProducts.toLocaleString()} icon={Boxes} color="blue" />
        <MetricCard title="Available Stock" value={`${summary.totalAvailableStock.toLocaleString()} Box`} icon={PackageCheck} color="emerald" />
        <MetricCard title="Blocked Hold" value={`${summary.totalBlockedStock.toLocaleString()} Box`} icon={Lock} color="amber" />
        <MetricCard title="Transit Stock" value={`${summary.totalInTransit.toLocaleString()} Box`} icon={Truck} color="indigo" />
        <MetricCard title="Low / Out stock" value={`${summary.lowStock} / ${summary.outOfStock}`} icon={AlertTriangle} color="rose" />
      </div>

      {/* LAYOUT GRID */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT MOVEMENTS LOG */}
        <div className="lg:col-span-2 rounded-xl border border-slate-850 bg-[#0c1122] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-4">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stock Movement Ledger</h2>
            </div>
            <Link href="/reports" className="text-[10px] font-bold text-amber-500 hover:underline">
              View Log →
            </Link>
          </div>

          <div className="divide-y divide-slate-850">
            {recentMovements.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">No stock movements recorded today.</p>
            ) : (
              recentMovements.map((mov) => {
                const prod = mov.inventory?.product;
                const isPositive = mov.quantity > 0;
                return (
                  <div key={mov.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          {prod?.name || "Product"}
                        </p>
                        <p className="text-[10px] text-slate-450 mt-0.5">
                          {mov.movementType} • Reason: {mov.reason || "Audit"} • By {mov.performedBy}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${isPositive ? "text-emerald-400" : "text-rose-450"}`}>
                        {isPositive ? `+${mov.quantity}` : mov.quantity} Boxes
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {new Date(mov.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* PENDING ACTIONS (DEALER BLOCKS QUEUE) */}
        <div className="rounded-xl border border-slate-850 bg-[#0c1122] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-4">
            <div>
              <h2 className="text-xs font-bold text-slate-450 uppercase tracking-wider">Pending Block Requests</h2>
            </div>
            <Link href="/blocks" className="text-[10px] font-bold text-amber-500 hover:underline">
              View All →
            </Link>
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {pendingBlocks.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-550 italic">All block approval requests processed.</p>
            ) : (
              pendingBlocks.map((block) => (
                <div key={block.id} className="rounded-lg border border-slate-850 bg-slate-900/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">{block.dealer?.name || "Dealer Request"}</p>
                    <span className="rounded bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                      {block.quantity} Boxes
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-450">Requested by: <strong>{block.requestedBy}</strong></p>
                  {block.remarks && <p className="text-[10px] text-slate-450 italic">"{block.remarks}"</p>}
                  <Link
                    href="/blocks"
                    className="block w-full rounded bg-slate-800 text-center text-[10px] font-black text-slate-200 py-1.5 hover:bg-slate-750 border border-slate-700"
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
    blue: "border-blue-500/15 bg-blue-500/5 text-blue-400",
    emerald: "border-emerald-500/15 bg-emerald-500/5 text-emerald-400",
    amber: "border-amber-500/15 bg-amber-500/5 text-amber-400",
    indigo: "border-indigo-500/15 bg-indigo-500/5 text-indigo-400",
    rose: "border-rose-500/15 bg-rose-500/5 text-rose-455",
  };

  return (
    <div className="rounded-xl border border-slate-850 bg-[#0c1122] p-4 shadow-sm flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest leading-normal">{title}</span>
        <div className={`rounded-lg border p-1.5 ${colorMap[color]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div>
        <p className="text-lg font-black tracking-tight text-white">{value}</p>
      </div>
    </div>
  );
}
