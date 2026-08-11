"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Search, 
  Filter, 
  Check,
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import { SessionContext } from "@/lib/session";
import { bulkApproveBookingsAction } from "@/app/actions";

interface BookingItem {
  id: string;
  bookingNumber: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string | null;
  priority: string;
  notes: string | null;
  dealer: { name: string; company: string | null };
  warehouse: { name: string; code: string };
  items: Array<{
    id: string;
    requestedQuantity: number;
    approvedQuantity: number;
    product: { name: string; sku: string | null };
  }>;
}

interface SummaryCounts {
  active: number;
  pending: number;
  expiring: number;
  confirmed: number;
  cancelled: number;
  rejected: number;
}

interface Props {
  bookings: BookingItem[];
  summary: SummaryCounts;
  dealers: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
  session: SessionContext;
}

export function BookingsDashboardClient({ bookings, summary, dealers, warehouses, session }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State for bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<{ approved: number; failed: number; insufficientStock: number } | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // Read filters
  const currentStatus = searchParams.get("status") || "";
  const currentPriority = searchParams.get("priority") || "";
  const currentWarehouseId = searchParams.get("warehouseId") || "";
  const currentDealerId = searchParams.get("dealerId") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const currentSearch = searchParams.get("search") || "";

  // Update URL parameters
  const updateFilters = (newFilters: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newFilters).forEach(([key, val]) => {
      if (val === null || val === "") {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    router.push(`${pathname}?${params.toString()}`);
  };

  const sortedBookings = [...bookings].sort((a, b) => {
    if (currentSort === "newest") return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    if (currentSort === "oldest") return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
    if (currentSort === "qty") {
      const getQty = (x: BookingItem) => x.items.reduce((s, i) => s + i.requestedQuantity, 0);
      return getQty(b) - getQty(a);
    }
    if (currentSort === "priority") {
      const pWeight: Record<string, number> = { URGENT: 3, HIGH: 2, NORMAL: 1 };
      return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
    }
    if (currentSort === "expiry") {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    }
    return 0;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const eligible = bookings.filter((b) => b.status === "PENDING_APPROVAL").map((b) => b.id);
      setSelectedIds(eligible);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Confirm bulk approval of ${selectedIds.length} reservations?`)) return;

    setIsBulkApproving(true);
    setBulkResult(null);
    try {
      const res = await bulkApproveBookingsAction(selectedIds, `Bulk Manager`);
      setBulkResult(res);
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Bulk action failed: ${err.message}`);
    } finally {
      setIsBulkApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SUMMARIZED FILTERS ROW */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard title="Pending Review" count={summary.pending} color="amber" active={currentStatus === "PENDING_APPROVAL"} onClick={() => updateFilters({ status: "PENDING_APPROVAL" })} />
        <MetricCard title="Awaiting Confirm" count={summary.expiring} color="indigo" active={currentStatus === "AWAITING_DEALER_CONFIRMATION"} onClick={() => updateFilters({ status: "AWAITING_DEALER_CONFIRMATION" })} />
        <MetricCard title="Active Reserves" count={summary.active} color="emerald" active={currentStatus === "APPROVED"} onClick={() => updateFilters({ status: "APPROVED" })} />
        <MetricCard title="Confirmed" count={summary.confirmed} color="blue" active={currentStatus === "CONFIRMED"} onClick={() => updateFilters({ status: "CONFIRMED" })} />
        <MetricCard title="Cancelled" count={summary.cancelled} color="slate" active={currentStatus === "CANCELLED"} onClick={() => updateFilters({ status: "CANCELLED" })} />
        <MetricCard title="Rejected" count={summary.rejected} color="rose" active={currentStatus === "REJECTED"} onClick={() => updateFilters({ status: "REJECTED" })} />
      </div>

      {/* BULK ACTION RESULTS PANEL */}
      {bulkResult && (
        <div className="rounded-xl border border-slate-800 bg-[#0c1122]/90 p-4 shadow-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider">Batch approval completed</h4>
              <p className="text-slate-400 mt-1 flex gap-3">
                <span className="text-emerald-400 font-bold">{bulkResult.approved} Approved</span>
                <span className="text-amber-400 font-bold">{bulkResult.insufficientStock} Insufficient Stock</span>
                <span className="text-rose-400 font-bold">{bulkResult.failed} Failures</span>
              </p>
            </div>
          </div>
          <button onClick={() => setBulkResult(null)} className="rounded-lg bg-slate-850 px-3 py-1.5 text-[10px] font-bold text-slate-350 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* FILTER CONTROL MODULE */}
      <div className="rounded-xl border border-slate-850 bg-[#0c1122]/70 p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Status */}
            <div className="flex items-center gap-1 bg-slate-950 border border-[#1b253b]/55 rounded-lg px-2.5 py-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={currentStatus}
                onChange={(e) => updateFilters({ status: e.target.value })}
                className="bg-transparent text-xs text-slate-300 focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="AWAITING_DEALER_CONFIRMATION">Awaiting Confirmation</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="ALLOCATED">Allocated</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
                <option value="ON_HOLD">On Hold</option>
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-1 bg-slate-950 border border-[#1b253b]/55 rounded-lg px-2.5 py-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={currentPriority}
                onChange={(e) => updateFilters({ priority: e.target.value })}
                className="bg-transparent text-xs text-slate-300 focus:outline-hidden"
              >
                <option value="">All Priorities</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            {/* Dealer/Warehouse (non-dealers only) */}
            {session.role !== "DEALER" && (
              <>
                <select
                  value={currentDealerId}
                  onChange={(e) => updateFilters({ dealerId: e.target.value })}
                  className="rounded-lg border border-[#1b253b]/55 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-hidden"
                >
                  <option value="">All Dealers</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>

                <select
                  value={currentWarehouseId}
                  onChange={(e) => updateFilters({ warehouseId: e.target.value })}
                  className="rounded-lg border border-[#1b253b]/55 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-hidden"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Sort</span>
            <select
              value={currentSort}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="rounded-lg border border-[#1b253b]/55 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-hidden"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="qty">Total boxes</option>
              <option value="priority">Priority weight</option>
              <option value="expiry">Expiry limit</option>
            </select>
          </div>
        </div>

        {/* Global Input search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Type Booking number or Rep and press Enter..."
            defaultValue={currentSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilters({ search: e.currentTarget.value });
              }
            }}
            className="w-full rounded-lg border border-[#1b253b]/55 bg-slate-950 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* QUEUES WRAPPER */}
      <div className="overflow-hidden rounded-xl border border-slate-850 bg-[#0c1122] shadow-xl">
        {/* Bulk Action Header */}
        {selectedIds.length > 0 && session.role !== "DEALER" && (
          <div className="bg-amber-500/10 border-b border-slate-850 px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-amber-400">
              {selectedIds.length} reservations selected for batch action
            </span>
            <button
              onClick={handleBulkApprove}
              disabled={isBulkApproving}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition-all touch-target"
            >
              <Check className="h-4 w-4" />
              {isBulkApproving ? "Processing..." : "Approve Selected"}
            </button>
          </div>
        )}

        {/* DESKTOP TABLE */}
        <table className="hidden md:table w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#1b253b]/65 bg-[#080c16] text-[10px] font-black uppercase text-slate-450 tracking-wider">
            <tr>
              {session.role !== "DEALER" && (
                <th className="px-4 py-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      bookings.length > 0 &&
                      bookings
                        .filter((b) => b.status === "PENDING_APPROVAL")
                        .every((b) => selectedIds.includes(b.id))
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950"
                  />
                </th>
              )}
              <th className="px-4 py-4 font-mono">Booking ID</th>
              <th className="px-4 py-4">Dealer / Rep</th>
              <th className="px-4 py-4">Warehouse</th>
              <th className="px-4 py-4">Requested Items</th>
              <th className="px-4 py-4 text-right">Total Qty</th>
              <th className="px-4 py-4">Expires In</th>
              <th className="px-4 py-4">Priority</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1b253b]/35 font-medium text-slate-200">
            {sortedBookings.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-xs text-slate-550 italic">
                  No hold reservations found.
                </td>
              </tr>
            ) : (
              sortedBookings.map((b) => {
                const totalQty = b.items.reduce((s, i) => s + i.requestedQuantity, 0);
                const isPending = b.status === "PENDING_APPROVAL";
                return (
                  <tr key={b.id} className="hover:bg-slate-900/30 transition-colors">
                    {session.role !== "DEALER" && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!isPending}
                          checked={selectedIds.includes(b.id)}
                          onChange={(e) => handleSelectOne(b.id, e.target.checked)}
                          className="rounded border-slate-800 bg-slate-950 disabled:opacity-30"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5 font-mono text-[10.5px] text-slate-450 font-bold">
                      {b.bookingNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-white">{b.dealer?.name}</p>
                      <p className="text-[10px] text-slate-450 mt-0.5">By {b.requestedBy}</p>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-300">
                      {b.warehouse?.code}
                    </td>
                    <td className="px-4 py-3.5 max-w-[200px] truncate text-slate-400">
                      {b.items.map(i => i.product.name).join(", ")}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-amber-500 font-mono">
                      {totalQty.toLocaleString()} Box
                    </td>
                    <td className="px-4 py-3.5">
                      <TimeRemainingBadge expiresAt={b.expiresAt} status={b.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <PriorityBadge priority={b.priority} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-750 px-2.5 py-1 text-[10px] font-black text-slate-200 transition-all touch-target"
                      >
                        Inspect <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* MOBILE CARDS */}
        <div className="md:hidden space-y-3 p-3 bg-slate-950/20">
          {sortedBookings.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic">No bookings found.</div>
          ) : (
            sortedBookings.map((b) => {
              const totalQty = b.items.reduce((s, i) => s + i.requestedQuantity, 0);
              const isPending = b.status === "PENDING_APPROVAL";
              return (
                <div 
                  key={b.id} 
                  className="rounded-xl border border-slate-855 bg-[#0c1122] p-4 shadow-md space-y-3 relative"
                >
                  {/* Checkbox placement for bulk */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-2">
                      {session.role !== "DEALER" && isPending && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(b.id)}
                          onChange={(e) => handleSelectOne(b.id, e.target.checked)}
                          className="rounded border-slate-800 bg-slate-950 mr-1.5 touch-target"
                        />
                      )}
                      <div>
                        <span className="font-mono text-[10px] font-bold text-slate-450 block">#{b.bookingNumber}</span>
                        <h4 className="text-xs font-black text-white mt-0.5">{b.dealer?.name}</h4>
                      </div>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="space-y-1 text-[10.5px]">
                    <p className="text-slate-450">
                      Warehouse: <strong className="text-slate-350">{b.warehouse?.code}</strong>
                    </p>
                    <p className="text-slate-450 truncate">
                      Items: <strong className="text-slate-350">{b.items.map(i => i.product.name).join(", ")}</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-850 bg-slate-950/45 rounded-lg text-center text-xs">
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-slate-550">Quantity</p>
                      <p className="font-black text-amber-500 mt-0.5">{totalQty} Box</p>
                    </div>
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-slate-550">Priority</p>
                      <div className="mt-0.5"><PriorityBadge priority={b.priority} /></div>
                    </div>
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-slate-550">Remaining</p>
                      <div className="mt-0.5 flex justify-center">
                        <TimeRemainingBadge expiresAt={b.expiresAt} status={b.status} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Link
                      href={`/bookings/${b.id}`}
                      className="inline-flex items-center gap-1 rounded bg-slate-850 px-3.5 py-1.5 text-[10px] font-black text-slate-300 hover:text-white transition-all touch-target"
                    >
                      Review Hold <ChevronRight className="h-3.5 w-3.5 text-slate-450" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, count, color, active, onClick }: any) {
  const colorMap: any = {
    amber: "border-amber-500/15 text-amber-400 bg-amber-500/5",
    emerald: "border-emerald-500/15 text-emerald-400 bg-emerald-500/5",
    indigo: "border-indigo-500/15 text-indigo-400 bg-indigo-500/5",
    blue: "border-blue-500/15 text-blue-400 bg-blue-500/5",
    rose: "border-rose-500/15 text-rose-455 bg-rose-500/5",
    slate: "border-slate-850 text-slate-450 bg-slate-900/40",
  };

  const activeColorMap: any = {
    amber: "border-amber-500 text-amber-400 bg-amber-500/10 shadow-sm active-nav-indicator",
    emerald: "border-emerald-500 text-emerald-400 bg-emerald-500/10 shadow-sm active-nav-indicator",
    indigo: "border-indigo-500 text-indigo-400 bg-indigo-500/10 shadow-sm active-nav-indicator",
    blue: "border-blue-500 text-blue-400 bg-blue-500/10 shadow-sm active-nav-indicator",
    rose: "border-rose-500 text-rose-400 bg-rose-500/10 shadow-sm active-nav-indicator",
    slate: "border-slate-500 text-slate-200 bg-slate-800 shadow-sm active-nav-indicator",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left shadow-sm transition-all touch-target ${
        active ? activeColorMap[color] : `${colorMap[color]} hover:scale-102`
      }`}
    >
      <p className="text-[9px] font-black tracking-widest uppercase text-slate-450 truncate">{title}</p>
      <p className="mt-2 text-xl font-black tracking-tight">{count}</p>
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const badgeMap: any = {
    NORMAL: "bg-slate-900 text-slate-400 border-slate-800",
    HIGH: "bg-amber-500/10 text-amber-450 border-amber-500/15",
    URGENT: "bg-rose-500/10 text-rose-400 border-rose-500/15",
  };

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8.5px] font-black uppercase ${badgeMap[priority] || badgeMap.NORMAL}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    DRAFT: "bg-slate-900 text-slate-450 border-slate-800",
    PENDING_APPROVAL: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    AWAITING_DEALER_CONFIRMATION: "bg-indigo-500/10 text-indigo-400 border-indigo-500/15",
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
    REJECTED: "bg-rose-500/10 text-rose-455 border-rose-500/15",
    CONFIRMED: "bg-blue-500/10 text-blue-400 border-blue-500/15",
    ALLOCATED: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15",
    FULFILLED: "bg-teal-500/10 text-teal-400 border-teal-500/15",
    CANCELLED: "bg-slate-800 text-slate-450 border-slate-850",
    EXPIRED: "bg-rose-500/10 text-rose-455 border-rose-500/15",
    RELEASED: "bg-slate-850 text-slate-450 border-slate-800",
    ON_HOLD: "bg-amber-500/10 text-amber-450 border-amber-500/15",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${badgeMap[status] || badgeMap.PENDING_APPROVAL}`}>
      <span className="h-1 w-1 rounded-full bg-current"></span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function TimeRemainingBadge({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  if (status !== "AWAITING_DEALER_CONFIRMATION") {
    return <span className="text-[10px] text-slate-500">—</span>;
  }

  if (!expiresAt) return <span className="text-[10px] text-slate-450">No Expiry</span>;

  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-455">Expired</span>;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 65));

  return (
    <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-indigo-400">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{hours}h {mins}m</span>
    </span>
  );
}
