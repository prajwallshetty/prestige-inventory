"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { 
  Clock, 
  ChevronRight, 
  Search, 
  Check,
  ChevronDown
} from "lucide-react";
import { SessionContext } from "@/lib/session";
import { toast } from "sonner";
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
      const pendingIds = bookings
        .filter((b) => b.status === "PENDING_APPROVAL")
        .map((b) => b.id);
      setSelectedIds(pendingIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkApproving(true);
    setBulkResult(null);
    try {
      const res = await bulkApproveBookingsAction(selectedIds);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBulkResult(res.data);
      setSelectedIds([]);
      router.refresh();
    } catch {
      toast.error("Connection failed. Please try again.");
    } finally {
      setIsBulkApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
          {"Stock Reservation Queue"}
        </h1>
        <p className="text-xs text-[#6B6B6B]">
          Approve pending stock reservations, extend block hold leases, and manage dealer allocations.
        </p>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          title="All Bookings"
          count={summary.active + summary.pending + summary.confirmed}
          color="slate"
          active={currentStatus === ""}
          onClick={() => updateFilters({ status: "" })}
        />
        <MetricCard
          title="Pending Review"
          count={summary.pending}
          color="amber"
          active={currentStatus === "PENDING_APPROVAL"}
          onClick={() => updateFilters({ status: "PENDING_APPROVAL" })}
        />
        <MetricCard
          title="Awaiting Confirm"
          count={summary.expiring}
          color="indigo"
          active={currentStatus === "AWAITING_DEALER_CONFIRMATION"}
          onClick={() => updateFilters({ status: "AWAITING_DEALER_CONFIRMATION" })}
        />
        <MetricCard
          title="Confirmed Lock"
          count={summary.confirmed}
          color="emerald"
          active={currentStatus === "CONFIRMED"}
          onClick={() => updateFilters({ status: "CONFIRMED" })}
        />
        <MetricCard
          title="Rejected Holds"
          count={summary.rejected}
          color="rose"
          active={currentStatus === "REJECTED"}
          onClick={() => updateFilters({ status: "REJECTED" })}
        />
        <MetricCard
          title="Released/Expired"
          count={summary.cancelled}
          color="blue"
          active={currentStatus === "CANCELLED"}
          onClick={() => updateFilters({ status: "CANCELLED" })}
        />
      </div>

      {/* BATCH ACTION RESULTS */}
      {bulkResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 space-y-1">
          <p className="font-bold">Batch Approval Process Completed:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Successfully Approved: <strong className="text-emerald-800">{bulkResult.approved} holds</strong></li>
            {bulkResult.insufficientStock > 0 && (
              <li className="text-amber-800">Insufficient Warehouse Stock: <strong>{bulkResult.insufficientStock} holds rejected/skipped</strong></li>
            )}
            {bulkResult.failed > 0 && (
              <li className="text-rose-800">System Errors: <strong>{bulkResult.failed} holds failed</strong></li>
            )}
          </ul>
          <button
            onClick={() => setBulkResult(null)}
            className="text-[10px] underline font-bold mt-1 text-emerald-800 hover:text-emerald-950"
          >
            Dismiss Alert
          </button>
        </div>
      )}

      {/* FILTER CONTROL BAR */}
      <div className="flex flex-col gap-4 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Dealer Filter (Manager Only) */}
            {true && (
              <div className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] px-2.5 py-1.5 bg-white text-xs">
                <span className="text-[#6B6B6B] font-bold">Dealer:</span>
                <select
                  value={currentDealerId}
                  onChange={(e) => updateFilters({ dealerId: e.target.value })}
                  className="bg-transparent font-medium text-[#111111] focus:outline-hidden cursor-pointer"
                >
                  <option value="">All Dealers</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Warehouse Filter */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] px-2.5 py-1.5 bg-white text-xs">
              <span className="text-[#6B6B6B] font-bold">Depot:</span>
              <select
                value={currentWarehouseId}
                onChange={(e) => updateFilters({ warehouseId: e.target.value })}
                className="bg-transparent font-medium text-[#111111] focus:outline-hidden cursor-pointer"
              >
                <option value="">All Depots</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code}</option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] px-2.5 py-1.5 bg-white text-xs">
              <span className="text-[#6B6B6B] font-bold">Priority:</span>
              <select
                value={currentPriority}
                onChange={(e) => updateFilters({ priority: e.target.value })}
                className="bg-transparent font-medium text-[#111111] focus:outline-hidden cursor-pointer"
              >
                <option value="">All</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] px-2.5 py-1.5 bg-white text-xs">
            <span className="text-[#6B6B6B] font-bold">Sort:</span>
            <select
              value={currentSort}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="bg-transparent font-medium text-[#111111] focus:outline-hidden cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="qty">Total Quantity</option>
              <option value="priority">Priority weight</option>
              <option value="expiry">Expiry limit</option>
            </select>
          </div>
        </div>

        {/* Global Input search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Type Booking number or Rep and press Enter..."
            defaultValue={currentSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilters({ search: e.currentTarget.value });
              }
            }}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>
      </div>

      {/* QUEUES TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        {/* Bulk Action Header */}
        {selectedIds.length > 0 && (
          <div className="bg-amber-50 border-b border-[#EAEAEA] px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-amber-800">
              {selectedIds.length} reservations selected for batch action
            </span>
            <button
              onClick={handleBulkApprove}
              disabled={isBulkApproving}
              className="flex items-center gap-1.5 rounded-lg bg-[#F2C202] px-3.5 py-1.5 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-40 transition-all touch-target"
            >
              <Check className="h-4 w-4" />
              {isBulkApproving ? "Processing..." : "Approve Selected"}
            </button>
          </div>
        )}

        {/* DESKTOP TABLE */}
        <table className="hidden md:table w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              {true && (
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
                    className="rounded border-[#EAEAEA] bg-white"
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
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {sortedBookings.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No hold reservations found.
                </td>
              </tr>
            ) : (
              sortedBookings.map((b) => {
                const totalQty = b.items.reduce((s, i) => s + i.requestedQuantity, 0);
                const isPending = b.status === "PENDING_APPROVAL";
                return (
                  <tr key={b.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                    {true && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!isPending}
                          checked={selectedIds.includes(b.id)}
                          onChange={(e) => handleSelectOne(b.id, e.target.checked)}
                          className="rounded border-[#EAEAEA] bg-white disabled:opacity-30"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5 font-mono text-[10.5px] text-[#6B6B6B] font-bold">
                      {b.bookingNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-[#111111]">{b.dealer?.name}</p>
                      <p className="text-[10px] text-[#6B6B6B] mt-0.5">By {b.requestedBy}</p>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-[#6B6B6B]">
                      {b.warehouse?.code}
                    </td>
                    <td className="px-4 py-3.5 max-w-[200px] truncate text-[#6B6B6B]">
                      {b.items.map(i => i.product.name).join(", ")}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-[#8A7300] font-mono">
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
                        className="inline-flex items-center gap-1 rounded bg-[#F7F7F5] border border-[#EAEAEA] hover:bg-[#EAEAEA] px-2.5 py-1 text-[10px] font-black text-[#111111] transition-all touch-target"
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
        <div className="md:hidden space-y-3 p-3 bg-[#F7F7F5]/50">
          {sortedBookings.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#6B6B6B] italic">No bookings found.</div>
          ) : (
            sortedBookings.map((b) => {
              const totalQty = b.items.reduce((s, i) => s + i.requestedQuantity, 0);
              const isPending = b.status === "PENDING_APPROVAL";
              return (
                <div 
                  key={b.id} 
                  className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm space-y-3 relative"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(b.id)}
                          onChange={(e) => handleSelectOne(b.id, e.target.checked)}
                          className="rounded border-[#EAEAEA] bg-white mr-1.5 touch-target"
                        />
                      )}
                      <div>
                        <span className="font-mono text-[10px] font-bold text-[#6B6B6B] block">#{b.bookingNumber}</span>
                        <h4 className="text-xs font-black text-[#111111] mt-0.5">{b.dealer?.name}</h4>
                      </div>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="space-y-1 text-[10.5px]">
                    <p className="text-[#6B6B6B]">
                      Warehouse: <strong className="text-[#111111]">{b.warehouse?.code}</strong>
                    </p>
                    <p className="text-[#6B6B6B] truncate">
                      Items: <strong className="text-[#111111]">{b.items.map(i => i.product.name).join(", ")}</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#EAEAEA] bg-[#F7F7F5] rounded-lg text-center text-xs">
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-[#6B6B6B]">Quantity</p>
                      <p className="font-black text-[#8A7300] mt-0.5">{totalQty} Box</p>
                    </div>
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-[#6B6B6B]">Priority</p>
                      <div className="mt-0.5"><PriorityBadge priority={b.priority} /></div>
                    </div>
                    <div>
                      <p className="text-[8.5px] uppercase font-bold text-[#6B6B6B]">Remaining</p>
                      <div className="mt-0.5 flex justify-center">
                        <TimeRemainingBadge expiresAt={b.expiresAt} status={b.status} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Link
                      href={`/bookings/${b.id}`}
                      className="inline-flex items-center gap-1 rounded bg-[#F7F7F5] border border-[#EAEAEA] px-3.5 py-1.5 text-[10px] font-black text-[#111111] hover:bg-[#EAEAEA] transition-all touch-target"
                    >
                      Review Hold <ChevronRight className="h-3.5 w-3.5 text-[#6B6B6B]" />
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
    amber: "border-amber-100 text-amber-800 bg-amber-50",
    emerald: "border-emerald-100 text-emerald-800 bg-emerald-50",
    indigo: "border-indigo-100 text-indigo-800 bg-indigo-50",
    blue: "border-blue-100 text-blue-800 bg-blue-50",
    rose: "border-rose-100 text-rose-800 bg-rose-50",
    slate: "border-slate-200 text-[#6B6B6B] bg-[#F7F7F5]",
  };

  const activeColorMap: any = {
    amber: "border-amber-400 text-amber-900 bg-amber-100 shadow-sm active-nav-indicator",
    emerald: "border-emerald-400 text-emerald-900 bg-emerald-100 shadow-sm active-nav-indicator",
    indigo: "border-indigo-400 text-indigo-900 bg-indigo-100 shadow-sm active-nav-indicator",
    blue: "border-blue-400 text-blue-900 bg-blue-100 shadow-sm active-nav-indicator",
    rose: "border-rose-400 text-rose-900 bg-rose-100 shadow-sm active-nav-indicator",
    slate: "border-[#F2C202] text-[#8A7300] bg-[#F2C202]/10 shadow-sm active-nav-indicator",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left shadow-xs transition-all touch-target ${
        active ? activeColorMap[color] : `${colorMap[color]} hover:bg-white`
      }`}
    >
      <p className="text-[9px] font-black tracking-widest uppercase text-[#6B6B6B] truncate">{title}</p>
      <p className="mt-2 text-xl font-black tracking-tight">{count}</p>
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const badgeMap: any = {
    NORMAL: "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]",
    HIGH: "bg-amber-50 text-amber-700 border-amber-200",
    URGENT: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8.5px] font-black uppercase ${badgeMap[priority] || badgeMap.NORMAL}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    DRAFT: "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]",
    PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
    AWAITING_DEALER_CONFIRMATION: "bg-indigo-50 text-indigo-700 border-indigo-200",
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
    CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
    ALLOCATED: "bg-cyan-50 text-cyan-700 border-cyan-200",
    FULFILLED: "bg-teal-50 text-teal-700 border-teal-200",
    CANCELLED: "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]",
    EXPIRED: "bg-rose-50 text-rose-700 border-rose-200",
    RELEASED: "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]",
    ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${badgeMap[status] || badgeMap.PENDING_APPROVAL}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function TimeRemainingBadge({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  if (status !== "AWAITING_DEALER_CONFIRMATION") {
    return <span className="text-[10px] text-[#6B6B6B]/40">—</span>;
  }

  if (!expiresAt) return <span className="text-[10px] text-[#6B6B6B]">No Expiry</span>;

  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-700">Expired</span>;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-indigo-700">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{hours}h {mins}m</span>
    </span>
  );
}
