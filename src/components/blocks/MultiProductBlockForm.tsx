"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { OFFLINE_MESSAGE } from "@/lib/offline";
import {
  Search,
  Package,
  X,
  Loader2,
  AlertCircle,
  WifiOff,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Boxes
} from "lucide-react";
import {
  searchBlockableProductsAction,
  getAvailableToBlockAction,
  createMultiProductBlockAction,
} from "@/app/actions";

export interface ProductHit {
  id: string;
  name: string;
  productNumber: string;
  size: string | null;
  finish: string | null;
  brand: string | null;
  category: string | null;
  thumbnailKey: string | null;
  availableToBlock: number;
}

export interface Row {
  /** Local-only id for React keys and add/remove — never sent to the server. */
  key: string;
  query: string;
  results: ProductHit[];
  searching: boolean;
  selected: ProductHit | null;
  available: number | null;
  quantity: string;
}

let rowSeq = 0;
const newRow = (): Row => ({
  key: `row-${++rowSeq}-${Date.now()}`,
  query: "",
  results: [],
  searching: false,
  selected: null,
  available: null,
  quantity: "",
});

const DRAFT_STORAGE_KEY = "prestige_block_draft_v1";

interface Props {
  dealers: Array<{ id: string; dealerId: string | null; name: string }>;
  showroomName: string | null;
  createdByName: string;
  createdByRole: string;
}

export function MultiProductBlockForm({ dealers, showroomName, createdByName, createdByRole }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [dealerId, setDealerId] = useState("");
  const [durationHours, setDurationHours] = useState("48");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const inFlight = useRef(false);

  // Connectivity monitoring
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Restore draft from sessionStorage on initial client mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          setRows(
            parsed.rows.map((r: any) => ({
              key: r.key || `row-${++rowSeq}-${Date.now()}`,
              query: "",
              results: [],
              searching: false,
              selected: r.selected || null,
              available: r.available ?? (r.selected ? r.selected.availableToBlock : null),
              quantity: r.quantity ? String(r.quantity) : "",
            }))
          );
          if (parsed.dealerId) setDealerId(parsed.dealerId);
          if (parsed.durationHours) setDurationHours(String(parsed.durationHours));
          if (parsed.remarks) setRemarks(parsed.remarks);
          setHasDraft(true);
        }
      }
    } catch {
      /* ignore storage read errors */
    }
  }, []);

  // Save active state to sessionStorage for session safety
  useEffect(() => {
    const linesWithContent = rows.filter((r) => r.selected || r.quantity);
    if (linesWithContent.length > 0 || remarks || dealerId) {
      try {
        const draftPayload = {
          rows: rows.map((r) => ({
            key: r.key,
            selected: r.selected,
            available: r.available,
            quantity: r.quantity,
          })),
          dealerId,
          durationHours,
          remarks,
        };
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
        setHasDraft(true);
      } catch {
        /* ignore storage write errors */
      }
    }
  }, [rows, dealerId, durationHours, remarks]);

  const clearDraft = () => {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    setRows([newRow()]);
    setDealerId("");
    setDurationHours("48");
    setRemarks("");
    setHasDraft(false);
    setError(null);
    toast.success("Draft cleared.");
  };

  const updateRow = useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  // Fast debounced per-row server-side search (spec §3: 250-400ms debounce, indexed queries)
  const searchSeqRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (const row of rows) {
      if (row.selected) continue;
      const q = row.query.trim();
      if (q.length < 2) {
        if (row.results.length > 0) updateRow(row.key, { results: [], searching: false });
        continue;
      }
      updateRow(row.key, { searching: true });
      const t = setTimeout(async () => {
        const seq = (searchSeqRef.current[row.key] = (searchSeqRef.current[row.key] ?? 0) + 1);
        try {
          const hits = await searchBlockableProductsAction(q);
          if (searchSeqRef.current[row.key] !== seq) return;
          updateRow(row.key, { results: hits as ProductHit[], searching: false });
        } catch {
          if (searchSeqRef.current[row.key] !== seq) return;
          updateRow(row.key, { results: [], searching: false });
        }
      }, 300);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.key}:${r.query}:${!!r.selected}`).join("|")]);

  const pickProduct = async (rowKey: string, product: ProductHit) => {
    // Duplicate product variant handling (spec §5):
    // If the exact same product/variant is already added, inform the user to adjust the quantity.
    const duplicate = rows.find((r) => r.key !== rowKey && r.selected?.id === product.id);
    if (duplicate) {
      const variantDesc = [product.size, product.finish].filter(Boolean).join(" · ");
      toast.error(
        `"${product.name}${variantDesc ? ` (${variantDesc})` : ""}" is already in this block. Adjust the quantity on that line instead of adding a duplicate.`
      );
      return;
    }

    updateRow(rowKey, { selected: product, query: "", results: [], available: product.availableToBlock });
    try {
      const live = await getAvailableToBlockAction(product.id);
      updateRow(rowKey, { available: live });
    } catch {
      /* retain search-time stock figure */
    }
  };

  const clearRow = (key: string) =>
    updateRow(key, { selected: null, available: null, quantity: "", query: "" });

  const addRow = () => {
    if (rows.length >= 30) {
      toast.error("A single block order can hold up to 30 product lines.");
      return;
    }
    setRows((prev) => [...prev, newRow()]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  // ——— Totals & Shortage calculations (spec §7, §8, §9) ———
  const linesWithProduct = rows.filter((r) => r.selected);
  const qtyOf = (r: Row) => {
    const n = Number(r.quantity);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const totalRequested = linesWithProduct.reduce((sum, r) => sum + qtyOf(r), 0);
  const totalAvailable = linesWithProduct.reduce((sum, r) => sum + Math.min(qtyOf(r), r.available ?? 0), 0);
  const totalShortage = linesWithProduct.reduce((sum, r) => sum + Math.max(0, qtyOf(r) - (r.available ?? 0)), 0);
  const shortfallLines = linesWithProduct.filter((r) => qtyOf(r) > (r.available ?? 0)).length;

  const validLines = linesWithProduct.filter((r) => qtyOf(r) > 0);
  const hasInvalidQuantity = linesWithProduct.some((r) => r.quantity !== "" && qtyOf(r) <= 0);
  const canSubmit = validLines.length > 0 && !hasInvalidQuantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);

    if (!online) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    if (validLines.length === 0) {
      setError("Add at least one product with a quantity greater than zero.");
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await createMultiProductBlockAction({
        items: validLines.map((r) => ({ productId: r.selected!.id, quantity: qtyOf(r) })),
        dealerId: dealerId || undefined,
        remarks: remarks || undefined,
        durationHours: Number(durationHours) || 48,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Clear session draft on successful commit
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success(
        `Block ${result.data.orderNumber} created successfully with ${result.data.itemCount} product${result.data.itemCount > 1 ? "s" : ""}.`
      );

      // Determine appropriate redirect destination based on creator role
      const prefix =
        createdByRole === "SHOWROOM_STAFF"
          ? "/showroom-staff"
          : createdByRole === "SHOWROOM_INCHARGE"
          ? "/showroom-incharge"
          : createdByRole === "MANAGER"
          ? "/warehouse"
          : "/admin";

      router.push(`${prefix}/blocks/order/${result.data.orderId}`);
    } catch {
      setError("Connection failed. Please check your network and try again.");
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-6">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 shadow-xs">
          <WifiOff className="h-4 w-4 shrink-0" />
          {OFFLINE_MESSAGE}
        </div>
      )}

      {/* TOP HEADER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAEAEA] pb-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-[#F2C202]" />
          <span className="text-xs font-black uppercase tracking-wider text-[#111111]">
            Order Line Items ({linesWithProduct.length})
          </span>
        </div>
        {hasDraft && (
          <button
            type="button"
            onClick={clearDraft}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1 text-[11px] font-bold text-[#6B6B6B] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all touch-target"
          >
            <RotateCcw className="h-3 w-3" /> Clear Draft
          </button>
        )}
      </div>

      {/* MULTI-PRODUCT LINE ITEMS LIST */}
      <section className="space-y-4">
        {rows.map((row, idx) => (
          <ProductLine
            key={row.key}
            index={idx}
            row={row}
            canRemove={rows.length > 1}
            onQuery={(q) => updateRow(row.key, { query: q })}
            onPick={(p) => pickProduct(row.key, p)}
            onClear={() => clearRow(row.key)}
            onQuantity={(q) => updateRow(row.key, { quantity: q })}
            onRemove={() => removeRow(row.key)}
          />
        ))}

        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#EAEAEA] bg-white py-3.5 text-xs font-black uppercase tracking-wider text-[#6B6B6B] hover:border-[#F2C202] hover:text-[#111111] hover:bg-[#FDFBF4] transition-all min-h-[52px] shadow-xs active:scale-[0.99]"
        >
          <Plus className="h-4 w-4 text-[#F2C202]" /> Add Another Product / Variant
        </button>
      </section>

      {/* ORDER-LEVEL FIELDS */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-6 space-y-4 shadow-xs">
        <h2 className="text-[11px] font-black uppercase tracking-wider text-[#6B6B6B] border-b border-[#EAEAEA] pb-2">
          Order Reservation Parameters
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="block-dealer" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              Associated Dealer / Client
            </label>
            <select
              id="block-dealer"
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-xs sm:text-sm font-medium outline-hidden focus:border-[#F2C202] min-h-[46px]"
            >
              <option value="">No dealer / internal hold</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dealerId ? `${d.dealerId} — ${d.name}` : d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="block-expiry" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              Hold Reservation Duration
            </label>
            <select
              id="block-expiry"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-xs sm:text-sm font-medium outline-hidden focus:border-[#F2C202] min-h-[46px]"
            >
              <option value="24">24 hours (1 Day)</option>
              <option value="48">48 hours (2 Days - Standard)</option>
              <option value="72">72 hours (3 Days)</option>
              <option value="168">168 hours (7 Days - Extended)</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="block-remarks" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
            Internal Reservation Notes / Remarks
          </label>
          <textarea
            id="block-remarks"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Project reference, site delivery notes, or special instructions for approver..."
            className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-xs sm:text-sm outline-hidden focus:border-[#F2C202]"
          />
        </div>
      </section>

      {/* REAL-TIME BLOCK SUMMARY (spec §9) */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-2">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-[#111111]">
            Order Block Summary
          </h2>
          <span className="text-[10px] font-mono font-bold text-[#6B6B6B]">
            {linesWithProduct.length} Product{linesWithProduct.length === 1 ? "" : "s"} Selected
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Products</dt>
            <dd className="mt-1 text-base sm:text-lg font-black text-[#111111]">{linesWithProduct.length}</dd>
          </div>
          <div className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Total Requested</dt>
            <dd className="mt-1 text-base sm:text-lg font-black text-[#8A7300] font-mono">{totalRequested} <span className="text-xs font-normal">boxes</span></dd>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Available Stock</dt>
            <dd className="mt-1 text-base sm:text-lg font-black text-emerald-700 font-mono">{totalAvailable} <span className="text-xs font-normal">boxes</span></dd>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-amber-800">Need to Order</dt>
            <dd className="mt-1 text-base sm:text-lg font-black text-amber-700 font-mono">{totalShortage} <span className="text-xs font-normal">boxes</span></dd>
          </div>
        </dl>

        {shortfallLines > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {shortfallLines} of {linesWithProduct.length} product{linesWithProduct.length > 1 ? "s" : ""} exceed available physical stock and will require central procurement ({totalShortage} boxes). This does not block order creation.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#EAEAEA] text-[11px]">
          <div>
            <span className="text-[#6B6B6B]">Created By: </span>
            <strong className="text-[#111111]">{createdByName}</strong>
          </div>
          <div>
            <span className="text-[#6B6B6B]">Showroom: </span>
            <strong className="text-[#111111]">{showroomName || "Central Main"}</strong>
          </div>
          <div>
            <span className="text-[#6B6B6B]">Approval Flow: </span>
            <strong className="text-indigo-700 font-mono">
              {createdByRole === "SHOWROOM_STAFF" ? "In-Charge → Manager" : "Manager Direct"}
            </strong>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* SUBMISSION BAR WITH DOUBLE-CLICK PROTECTION */}
      <div className="sticky bottom-0 -mx-4 border-t border-[#EAEAEA] bg-white/95 px-4 py-3.5 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none z-20">
        <button
          type="submit"
          disabled={submitting || !canSubmit || !online}
          aria-busy={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F2C202] py-4 text-sm font-black text-white shadow-md transition-all active:scale-[0.99] hover:bg-[#D8AD02] disabled:cursor-not-allowed disabled:opacity-50 min-h-[52px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Submitting Multi-Product Block...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Submit Block Order {linesWithProduct.length > 0 ? `(${linesWithProduct.length} Items · ${totalRequested} Boxes)` : ""}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function ProductLine({
  index,
  row,
  canRemove,
  onQuery,
  onPick,
  onClear,
  onQuantity,
  onRemove,
}: {
  index: number;
  row: Row;
  canRemove: boolean;
  onQuery: (q: string) => void;
  onPick: (p: ProductHit) => void;
  onClear: () => void;
  onQuantity: (q: string) => void;
  onRemove: () => void;
}) {
  const qtyNum = Number(row.quantity);
  const qtyInvalid = row.quantity !== "" && (!Number.isFinite(qtyNum) || qtyNum <= 0);
  const shortage = row.selected && row.available !== null && qtyNum > 0 ? Math.max(0, qtyNum - row.available) : 0;
  const availableCoverage = row.selected && row.available !== null && qtyNum > 0 ? Math.min(qtyNum, row.available) : 0;

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs space-y-3.5 transition-all hover:border-[#D8D8D8]">
      {/* LINE HEADER */}
      <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F2C202]/20 text-[10px] font-black text-[#8A7300]">
            {index + 1}
          </span>
          <h3 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
            Product #{index + 1}
          </h3>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove product line ${index + 1}`}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-all min-h-[34px]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {/* SELECTED PRODUCT CARD OR SEARCH INPUT */}
      {row.selected ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3.5 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white border border-[#EAEAEA] overflow-hidden shadow-2xs">
              {row.selected.thumbnailKey ? (
                <img
                  src={row.selected.thumbnailKey}
                  alt={row.selected.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <Package className="h-6 w-6 text-[#6B6B6B]" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-bold text-[#111111]">{row.selected.name}</span>
                {row.selected.size && (
                  <span className="rounded-md bg-[#F2C202]/15 px-1.5 py-0.5 text-[10px] font-black text-[#8A7300]">
                    {row.selected.size}
                  </span>
                )}
                {row.selected.finish && (
                  <span className="rounded-md bg-white border border-[#EAEAEA] px-1.5 py-0.5 text-[10px] font-bold text-[#6B6B6B]">
                    {row.selected.finish}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#6B6B6B]">
                <span className="font-mono font-medium">{row.selected.productNumber}</span>
                {row.selected.brand && <span>· Brand: <strong>{row.selected.brand}</strong></span>}
                {row.selected.category && <span>· Category: <strong>{row.selected.category}</strong></span>}
              </div>
            </div>

            <button
              type="button"
              onClick={onClear}
              aria-label="Change product selection"
              className="shrink-0 rounded-lg p-2 text-[#6B6B6B] hover:bg-white hover:text-[#111111] border border-transparent hover:border-[#EAEAEA] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Select a different product"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* QUANTITY INPUT & STOCK EVALUATION CARD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`qty-${row.key}`} className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                  Quantity (Boxes) *
                </label>
                {row.available !== null && (
                  <span className="text-[10px] font-bold text-emerald-700 font-mono">
                    {row.available} boxes in stock
                  </span>
                )}
              </div>
              <input
                id={`qty-${row.key}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={row.quantity}
                onChange={(e) => onQuantity(e.target.value)}
                aria-invalid={qtyInvalid}
                className={`w-full rounded-xl border bg-white p-3 text-sm font-bold font-mono outline-hidden min-h-[46px] ${
                  qtyInvalid
                    ? "border-rose-300 focus:border-rose-500 ring-1 ring-rose-200"
                    : "border-[#EAEAEA] focus:border-[#F2C202]"
                }`}
                placeholder="e.g. 50"
              />
            </div>

            {/* PER-ITEM STOCK BREAKDOWN */}
            <div className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 flex flex-col justify-center text-xs space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#6B6B6B]">Available Stock:</span>
                <span className="font-bold font-mono text-emerald-700">{availableCoverage} boxes</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#6B6B6B]">Shortage (To Order):</span>
                <span className={`font-bold font-mono ${shortage > 0 ? "text-amber-700" : "text-[#6B6B6B]"}`}>
                  {shortage > 0 ? `${shortage} boxes` : "0 (Fully covered)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor={`product-search-${row.key}`} className="sr-only">
            Search products
          </label>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#EAEAEA] bg-white px-3.5 focus-within:border-[#F2C202] shadow-2xs">
            <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
            <input
              id={`product-search-${row.key}`}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={row.query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search by product name, SKU, size (e.g. 600x1200), brand, category..."
              className="w-full bg-transparent py-3.5 text-xs sm:text-sm font-medium outline-hidden min-h-[48px] placeholder:text-[#9A9A9A]"
            />
            {row.searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F2C202]" />}
          </div>

          {/* SEARCH RESULTS DROPDOWN */}
          {row.query.trim().length >= 2 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#EAEAEA] bg-white shadow-lg z-20 relative divide-y divide-[#EAEAEA]">
              {row.searching && row.results.length === 0 && (
                <div className="space-y-2.5 p-3.5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-[#EAEAEA]" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-[#EAEAEA]" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-[#F7F7F5]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!row.searching && row.results.length === 0 && (
                <p className="p-4 text-center text-xs italic text-[#6B6B6B]">
                  No matching products or variants found for "{row.query}".
                </p>
              )}
              {row.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#FDFBF4] active:bg-[#F5F0DC] transition-colors min-h-[56px]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F5] border border-[#EAEAEA]">
                    <Package className="h-4 w-4 text-[#6B6B6B]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-[#111111]">{p.name}</p>
                      {p.size && (
                        <span className="rounded bg-[#F2C202]/15 px-1 py-0.2 text-[9px] font-black text-[#8A7300]">
                          {p.size}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] text-[#6B6B6B]">{p.productNumber}</p>
                    <p className="text-[10px] text-[#6B6B6B] truncate">
                      {[p.brand, p.category, p.finish].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold font-mono ${
                      p.availableToBlock > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-[#EAEAEA] bg-[#F7F7F5] text-[#9A9A9A]"
                    }`}
                  >
                    {p.availableToBlock} in stock
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
