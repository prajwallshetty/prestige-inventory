"use client";

import React, { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingCart, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { createPurchaseOrderAction } from "@/app/actions";

export interface NeedToOrderRow {
  blockId: string;
  blockNumber: string | null;
  status: string;
  requestedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  physicalStock: number;
  priority: "URGENT" | "NORMAL";
  createdAt: string | null;
  showroom: { id: string; name: string; city: string | null } | null;
  product: { id: string; name: string; productNumber: string; size: string | null; brand: { id: string; name: string } | null } | null;
}

interface Props {
  result: { items: NeedToOrderRow[]; total: number; page: number; limit: number; totalPages: number };
  filters: { search: string; showroomId: string; priority: string; sort: string; page: number; limit: number };
  showrooms: Array<{ id: string; name: string }>;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export function NeedToOrderClientList({ result, filters, showrooms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poOpen, setPoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [supplier, setSupplier] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const pushFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, ...next };
    if (merged.search) params.set("search", merged.search);
    if (merged.showroomId) params.set("showroomId", merged.showroomId);
    if (merged.priority) params.set("priority", merged.priority);
    if (merged.sort && merged.sort !== "newest") params.set("sort", String(merged.sort));
    if (next.page) params.set("page", next.page);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    pushFilters({ search: searchInput, page: "1" });
  };

  const selectedRows = useMemo(() => result.items.filter((r) => selected.has(r.blockId)), [result.items, selected]);
  const selectedProductIds = useMemo(() => new Set(selectedRows.map((r) => r.product?.id).filter(Boolean)), [selectedRows]);
  const mixedProducts = selectedProductIds.size > 1;
  const selectedTotalShortage = selectedRows.reduce((sum, r) => sum + r.shortageQuantity, 0);

  const toggleRow = (blockId: string, productId: string | undefined) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
        return next;
      }
      // Guard against mixing products at selection time — a clearer moment
      // to catch it than after opening the purchase-order form.
      const firstOtherProduct = [...prev]
        .map((id) => result.items.find((r) => r.blockId === id)?.product?.id)
        .find((id) => id && id !== productId);
      if (firstOtherProduct) {
        toast.error("Select shortages for one product at a time — raise separate orders for different products.");
        return prev;
      }
      next.add(blockId);
      return next;
    });
  };

  const openPurchaseOrder = () => {
    if (selected.size === 0) return;
    setFormError(null);
    setPoOpen(true);
  };

  const submitPurchaseOrder = async () => {
    if (mixedProducts) {
      setFormError("Select shortages for one product only.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await createPurchaseOrderAction({
        blockIds: [...selected],
        supplier: supplier || undefined,
        purchaseReference: purchaseReference || undefined,
        expectedDate: expectedDate || undefined,
        remarks: remarks || undefined,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      toast.success(`Purchase order ${res.data.shipmentNumber} raised for ${selectedTotalShortage} boxes.`);
      setPoOpen(false);
      setSelected(new Set());
      setSupplier("");
      setPurchaseReference("");
      setExpectedDate("");
      setRemarks("");
      startTransition(() => router.refresh());
    } catch {
      setFormError("Connection failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search product, brand, block number, showroom…"
            className="w-full bg-transparent py-2.5 text-sm outline-hidden min-h-[40px]"
          />
        </form>

        <select
          value={filters.showroomId}
          onChange={(e) => pushFilters({ showroomId: e.target.value, page: "1" })}
          className="rounded-xl border border-[#EAEAEA] bg-white px-3 py-2.5 text-xs font-bold min-h-[40px]"
        >
          <option value="">All showrooms</option>
          {showrooms.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => pushFilters({ priority: e.target.value, page: "1" })}
          className="rounded-xl border border-[#EAEAEA] bg-white px-3 py-2.5 text-xs font-bold min-h-[40px]"
        >
          <option value="">All priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="NORMAL">Normal</option>
        </select>

        <select
          value={filters.sort}
          onChange={(e) => pushFilters({ sort: e.target.value, page: "1" })}
          className="rounded-xl border border-[#EAEAEA] bg-white px-3 py-2.5 text-xs font-bold min-h-[40px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="shortage_desc">Largest shortage</option>
        </select>
      </div>

      {/* SELECTION BAR */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F2C202] bg-[#FFFBEA] px-4 py-3">
          <p className="text-xs font-bold text-[#8A7300]">
            {selected.size} shortage{selected.size > 1 ? "s" : ""} selected · {selectedTotalShortage} boxes
            {mixedProducts && <span className="ml-2 text-rose-700">— mixed products, split into separate orders</span>}
          </p>
          <button
            onClick={openPurchaseOrder}
            disabled={mixedProducts}
            className="flex items-center gap-1.5 rounded-lg bg-[#111111] px-3 py-2 text-[11px] font-black text-white disabled:opacity-40"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Order Stock
          </button>
        </div>
      )}

      {/* DESKTOP TABLE */}
      <div className={`hidden overflow-x-auto rounded-2xl border border-[#EAEAEA] bg-white shadow-xs sm:block ${isPending ? "opacity-60" : ""}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-left text-[10px] font-black uppercase tracking-wide text-[#6B6B6B]">
              <th className="w-8 px-3 py-3"></th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3 text-right">Requested</th>
              <th className="px-3 py-3 text-right">Available</th>
              <th className="px-3 py-3 text-right">Need to Order</th>
              <th className="px-3 py-3">Block</th>
              <th className="px-3 py-3">Showroom</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Requested On</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA]">
            {result.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-xs italic text-[#6B6B6B]">
                  Nothing needs procurement right now.
                </td>
              </tr>
            )}
            {result.items.map((row) => (
              <tr key={row.blockId} className="hover:bg-[#F7F7F5]">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.blockId)}
                    onChange={() => toggleRow(row.blockId, row.product?.id)}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-3">
                  <p className="font-bold text-[#111111]">{row.product?.name || "Unknown product"}</p>
                  <p className="font-mono text-[10px] text-[#6B6B6B]">
                    {row.product?.productNumber} {row.product?.size ? `· ${row.product.size}` : ""}
                  </p>
                </td>
                <td className="px-3 py-3 text-right font-mono font-black text-[#111111]">{row.requestedQuantity}</td>
                <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">{row.availableQuantity}</td>
                <td className="px-3 py-3 text-right font-mono font-black text-amber-700">{row.shortageQuantity}</td>
                <td className="px-3 py-3">
                  <a href={`/blocks/${row.blockId}`} className="font-mono text-[10px] font-bold text-blue-700 hover:underline">
                    {row.blockNumber || row.blockId.slice(-8)}
                  </a>
                </td>
                <td className="px-3 py-3 text-[#6B6B6B]">{row.showroom?.name || "—"}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                      row.priority === "URGENT" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]"
                    }`}
                  >
                    {row.priority}
                  </span>
                </td>
                <td className="px-3 py-3 text-[#6B6B6B]">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-2.5 sm:hidden">
        {result.items.length === 0 && (
          <p className="rounded-xl border border-[#EAEAEA] bg-white p-6 text-center text-xs italic text-[#6B6B6B]">
            Nothing needs procurement right now.
          </p>
        )}
        {result.items.map((row) => (
          <div key={row.blockId} className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs space-y-2.5">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(row.blockId)}
                onChange={() => toggleRow(row.blockId, row.product?.id)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#111111]">{row.product?.name || "Unknown product"}</p>
                <p className="font-mono text-[10px] text-[#6B6B6B]">
                  {row.product?.productNumber} {row.product?.size ? `· ${row.product.size}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                  row.priority === "URGENT" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]"
                }`}
              >
                {row.priority}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-center">
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Requested</p>
                <p className="mt-0.5 font-mono text-sm font-black text-[#111111]">{row.requestedQuantity}</p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Available</p>
                <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">{row.availableQuantity}</p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Need to Order</p>
                <p className="mt-0.5 font-mono text-sm font-black text-amber-700">{row.shortageQuantity}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#6B6B6B]">
              <a href={`/blocks/${row.blockId}`} className="font-mono font-bold text-blue-700">
                {row.blockNumber || row.blockId.slice(-8)}
              </a>
              <span>{row.showroom?.name || "—"}</span>
              <span>{formatDate(row.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* PAGINATION */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
          <span>
            Page {result.page} of {result.totalPages} · {result.total} total
          </span>
          <div className="flex gap-2">
            <button
              disabled={result.page <= 1}
              onClick={() => pushFilters({ page: String(result.page - 1) })}
              className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={result.page >= result.totalPages}
              onClick={() => pushFilters({ page: String(result.page + 1) })}
              className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* CREATE PURCHASE ORDER MODAL */}
      {poOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-[#111111]">Order Stock</h2>
              <button onClick={() => setPoOpen(false)} className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 text-xs">
              <p className="font-bold text-[#111111]">{selectedRows[0]?.product?.name}</p>
              <p className="mt-1 text-[#6B6B6B]">
                {selected.size} block{selected.size > 1 ? "s" : ""} · {selectedTotalShortage} boxes to order
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Supplier</label>
                <input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#EAEAEA] bg-white p-2.5 text-sm outline-hidden focus:border-[#F2C202] min-h-[40px]"
                  placeholder="Supplier name"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Purchase Reference</label>
                <input
                  value={purchaseReference}
                  onChange={(e) => setPurchaseReference(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#EAEAEA] bg-white p-2.5 text-sm outline-hidden focus:border-[#F2C202] min-h-[40px]"
                  placeholder="PO / invoice reference"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Expected Arrival</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#EAEAEA] bg-white p-2.5 text-sm outline-hidden focus:border-[#F2C202] min-h-[40px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#EAEAEA] bg-white p-2.5 text-sm outline-hidden focus:border-[#F2C202]"
                />
              </div>
            </div>

            {formError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <button
              onClick={submitPurchaseOrder}
              disabled={submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] py-3 text-sm font-black text-white disabled:opacity-50 min-h-[46px]"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Raising order..." : "Raise Purchase Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
