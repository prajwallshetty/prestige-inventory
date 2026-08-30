"use client";

import React, { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, PackageCheck, Truck, Ban, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { advanceProcurementStatusAction, receiveProcurementAction } from "@/app/actions";

interface ShipmentItemRow {
  id: string;
  productId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
  status: string;
  product: { id: string; name: string; sku: string | null; productCode: string | null; size: string | null } | null;
  blocks: Array<{ id: string; block_number: string | null; showroomId: string | null }>;
}

export interface PurchaseOrderRow {
  id: string;
  shipmentNumber: string;
  supplier: string | null;
  purchaseReference: string | null;
  status: string;
  expectedDate: string | null;
  dispatchDate: string | null;
  arrivalDate: string | null;
  remarks: string | null;
  createdAt: string;
  warehouse: { id: string; name: string; code: string } | null;
  items: ShipmentItemRow[];
}

interface Props {
  result: { items: PurchaseOrderRow[]; total: number; page: number; limit: number; totalPages: number };
  filters: { search: string; status: string };
}

const TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "ORDERED", label: "Ordered" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "RECEIVED", label: "Received" },
  { key: "CANCELLED", label: "Cancelled" },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function statusStyle(status: string) {
  switch (status) {
    case "RECEIVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PARTIALLY_RECEIVED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "DISPATCHED":
    case "IN_TRANSIT":
    case "ARRIVED":
    case "RECEIVING":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]";
  }
}

export function ProcurementOrdersClientList({ result, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRow | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, { received: string; damaged: string }>>({});
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [submittingReceive, setSubmittingReceive] = useState(false);

  const pushFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, ...next };
    if (merged.search) params.set("search", merged.search);
    if (merged.status) params.set("status", merged.status);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    pushFilters({ search: searchInput });
  };

  const advance = async (order: PurchaseOrderRow, status: "DISPATCHED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED") => {
    setBusyId(order.id);
    try {
      const res = await advanceProcurementStatusAction(order.id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Purchase order ${order.shipmentNumber} moved to ${status.replace(/_/g, " ")}.`);
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  };

  const openReceive = (order: PurchaseOrderRow) => {
    const initial: Record<string, { received: string; damaged: string }> = {};
    for (const item of order.items) {
      const outstanding = item.expectedQuantity - item.receivedQuantity - item.damagedQuantity;
      initial[item.id] = { received: outstanding > 0 ? String(outstanding) : "0", damaged: "0" };
    }
    setReceiveInputs(initial);
    setReceiveError(null);
    setReceiveOrder(order);
  };

  const submitReceive = async () => {
    if (!receiveOrder) return;
    setSubmittingReceive(true);
    setReceiveError(null);
    try {
      const receivedItems = receiveOrder.items.map((item) => ({
        shipmentItemId: item.id,
        receivedQuantity: Number(receiveInputs[item.id]?.received || 0),
        damagedQuantity: Number(receiveInputs[item.id]?.damaged || 0),
      }));
      const res = await receiveProcurementAction({ shipmentId: receiveOrder.id, receivedItems });
      if (!res.ok) {
        setReceiveError(res.error);
        return;
      }
      toast.success(`Purchase order ${receiveOrder.shipmentNumber} receiving recorded.`);
      setReceiveOrder(null);
      startTransition(() => router.refresh());
    } catch {
      setReceiveError("Connection failed. Please try again.");
    } finally {
      setSubmittingReceive(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => pushFilters({ status: t.key })}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                filters.status === t.key ? "border-[#111111] bg-[#111111] text-white" : "border-[#EAEAEA] bg-white text-[#6B6B6B]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search order number, supplier, reference, product…"
            className="w-full bg-transparent py-2.5 text-sm outline-hidden min-h-[40px]"
          />
        </form>
      </div>

      <div className="space-y-2.5">
        {result.items.length === 0 && (
          <p className="rounded-xl border border-[#EAEAEA] bg-white p-8 text-center text-xs italic text-[#6B6B6B]">
            No purchase orders yet.
          </p>
        )}
        {result.items.map((order) => (
          <div key={order.id} className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-black text-[#111111]">{order.shipmentNumber}</p>
                <p className="text-[10px] text-[#6B6B6B]">
                  {order.supplier || "No supplier set"}
                  {order.purchaseReference ? ` · Ref ${order.purchaseReference}` : ""}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(order.status)}`}>
                {order.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-3 space-y-1.5">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#111111]">{item.product?.name || "Unknown product"}</p>
                    <p className="text-[10px] text-[#6B6B6B]">
                      {item.blocks.length} block{item.blocks.length !== 1 ? "s" : ""} covered
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono font-black text-[#111111]">{item.expectedQuantity} expected</p>
                    {(item.receivedQuantity > 0 || item.damagedQuantity > 0) && (
                      <p className="text-[10px] text-[#6B6B6B]">
                        {item.receivedQuantity} received{item.damagedQuantity > 0 ? `, ${item.damagedQuantity} damaged` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#6B6B6B]">
              {order.expectedDate && <span>Expected {formatDate(order.expectedDate)}</span>}
              {order.warehouse && <span>· {order.warehouse.name}</span>}
              <span>· Raised {formatDate(order.createdAt)}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {order.status === "EXPECTED" && (
                <button
                  onClick={() => advance(order, "DISPATCHED")}
                  disabled={busyId === order.id}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black text-blue-700 disabled:opacity-50"
                >
                  <Truck className="h-3.5 w-3.5" /> Mark Dispatched
                </button>
              )}
              {order.status === "DISPATCHED" && (
                <button
                  onClick={() => advance(order, "IN_TRANSIT")}
                  disabled={busyId === order.id}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black text-blue-700 disabled:opacity-50"
                >
                  <Truck className="h-3.5 w-3.5" /> Mark In Transit
                </button>
              )}
              {["EXPECTED", "DISPATCHED", "IN_TRANSIT"].includes(order.status) && (
                <button
                  onClick={() => advance(order, "ARRIVED")}
                  disabled={busyId === order.id}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-black text-indigo-700 disabled:opacity-50"
                >
                  {busyId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} Mark Arrived
                </button>
              )}
              {["EXPECTED", "DISPATCHED", "IN_TRANSIT", "ARRIVED", "RECEIVING"].includes(order.status) && (
                <button
                  onClick={() => openReceive(order)}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white"
                >
                  <PackageCheck className="h-3.5 w-3.5" /> Receive
                </button>
              )}
              {!["RECEIVED", "PARTIALLY_RECEIVED", "CANCELLED"].includes(order.status) && (
                <button
                  onClick={() => {
                    if (confirm(`Cancel purchase order ${order.shipmentNumber}?`)) advance(order, "CANCELLED");
                  }}
                  disabled={busyId === order.id}
                  className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-[10px] font-bold text-[#6B6B6B] disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* RECEIVE MODAL */}
      {receiveOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-[#111111]">Receive {receiveOrder.shipmentNumber}</h2>
              <button onClick={() => setReceiveOrder(null)} className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {receiveOrder.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#EAEAEA] p-3">
                  <p className="text-xs font-bold text-[#111111]">{item.product?.name}</p>
                  <p className="text-[10px] text-[#6B6B6B]">Expected {item.expectedQuantity} boxes</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-[#6B6B6B]">Received</label>
                      <input
                        type="number"
                        min={0}
                        value={receiveInputs[item.id]?.received ?? ""}
                        onChange={(e) =>
                          setReceiveInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], received: e.target.value } }))
                        }
                        className="mt-1 w-full rounded-lg border border-[#EAEAEA] p-2 text-sm outline-hidden focus:border-[#F2C202]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-[#6B6B6B]">Damaged</label>
                      <input
                        type="number"
                        min={0}
                        value={receiveInputs[item.id]?.damaged ?? ""}
                        onChange={(e) =>
                          setReceiveInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], damaged: e.target.value } }))
                        }
                        className="mt-1 w-full rounded-lg border border-[#EAEAEA] p-2 text-sm outline-hidden focus:border-[#F2C202]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {receiveError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{receiveError}</span>
              </div>
            )}

            <button
              onClick={submitReceive}
              disabled={submittingReceive}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-50 min-h-[46px]"
            >
              {submittingReceive && <Loader2 className="h-4 w-4 animate-spin" />}
              {submittingReceive ? "Recording..." : "Record Receipt"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
