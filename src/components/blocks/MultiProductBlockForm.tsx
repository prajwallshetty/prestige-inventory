"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { OFFLINE_MESSAGE } from "@/lib/offline";
import { Search, Package, X, Loader2, AlertCircle, WifiOff, Plus, Trash2 } from "lucide-react";
import {
  searchBlockableProductsAction,
  getAvailableToBlockAction,
  createMultiProductBlockAction,
} from "@/app/actions";

interface ProductHit {
  id: string;
  name: string;
  productNumber: string;
  size: string | null;
  brand: string | null;
  thumbnailKey: string | null;
  availableToBlock: number;
}

interface Row {
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
  const inFlight = useRef(false);

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

  const updateRow = useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  // Debounced per-row server-side search — never loads the full catalogue
  // (spec §3). A sequence counter per row discards stale/out-of-order replies.
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
          updateRow(row.key, { results: hits, searching: false });
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
    // Duplicate product handling (spec §5): don't silently create a second
    // line for the same product — point the user at the existing one.
    const duplicate = rows.find((r) => r.key !== rowKey && r.selected?.id === product.id);
    if (duplicate) {
      toast.error(`${product.name} is already added — adjust the quantity on that line instead of adding it twice.`);
      return;
    }

    updateRow(rowKey, { selected: product, query: "", results: [], available: product.availableToBlock });
    try {
      const live = await getAvailableToBlockAction(product.id);
      updateRow(rowKey, { available: live });
    } catch {
      /* keep the search-time figure */
    }
  };

  const clearRow = (key: string) => updateRow(key, { selected: null, available: null, quantity: "", query: "" });

  const addRow = () => {
    if (rows.length >= 30) {
      toast.error("A single order can hold up to 30 product lines.");
      return;
    }
    setRows((prev) => [...prev, newRow()]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  // ——— Totals (spec §9) ———
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

      toast.success(`Block ${result.data.orderNumber} created with ${result.data.itemCount} product${result.data.itemCount > 1 ? "s" : ""}.`);
      router.push(`/blocks/order/${result.data.orderId}`);
    } catch {
      setError("Connection failed. Please check your network and try again.");
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-5">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0" />
          {OFFLINE_MESSAGE}
        </div>
      )}

      <section className="space-y-3">
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#EAEAEA] bg-white py-3 text-xs font-black uppercase tracking-wide text-[#6B6B6B] hover:border-[#F2C202] hover:text-[#111111] min-h-[48px]"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </section>

      {/* ORDER-LEVEL FIELDS */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 space-y-4 shadow-xs">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Order Details</h2>

        <div className="space-y-1">
          <label htmlFor="block-dealer" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
            Dealer
          </label>
          <select
            id="block-dealer"
            value={dealerId}
            onChange={(e) => setDealerId(e.target.value)}
            className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-sm outline-hidden focus:border-[#F2C202] min-h-[44px]"
          >
            <option value="">No dealer / internal hold</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dealerId ? `${d.dealerId} — ${d.name}` : d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="block-expiry" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
            Hold Duration
          </label>
          <select
            id="block-expiry"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-sm outline-hidden focus:border-[#F2C202] min-h-[44px]"
          >
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
            <option value="168">7 days</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="block-remarks" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
            Remarks
          </label>
          <textarea
            id="block-remarks"
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional note for the approver"
            className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-sm outline-hidden focus:border-[#F2C202]"
          />
        </div>
      </section>

      {/* BLOCK SUMMARY — spec §9 */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 sm:p-5 space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Block Summary</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
          <div>
            <dt className="text-[#6B6B6B]">Products</dt>
            <dd className="font-black text-[#111111]">{linesWithProduct.length}</dd>
          </div>
          <div>
            <dt className="text-[#6B6B6B]">Total Requested</dt>
            <dd className="font-black text-[#111111]">{totalRequested}</dd>
          </div>
          <div>
            <dt className="text-[#6B6B6B]">Available</dt>
            <dd className="font-black text-emerald-700">{totalAvailable}</dd>
          </div>
          <div>
            <dt className="text-[#6B6B6B]">Need to Order</dt>
            <dd className="font-black text-amber-700">{totalShortage}</dd>
          </div>
        </dl>
        {shortfallLines > 0 && (
          <p className="text-[10px] font-bold text-amber-800">
            {shortfallLines} of {linesWithProduct.length} product{linesWithProduct.length > 1 ? "s" : ""} will need procurement — this
            doesn't block submission.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-2 border-t border-[#EAEAEA]">
          <dt className="text-[#6B6B6B]">Created by</dt>
          <dd className="text-right font-bold text-[#111111]">{createdByName}</dd>
          <dt className="text-[#6B6B6B]">Showroom</dt>
          <dd className="text-right font-bold text-[#111111]">{showroomName || "—"}</dd>
          <dt className="text-[#6B6B6B]">Approval route</dt>
          <dd className="text-right font-bold text-[#111111]">
            {createdByRole === "SHOWROOM_STAFF" ? "In-Charge → Manager" : "Manager"}
          </dd>
        </dl>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-[#EAEAEA] bg-white/95 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={submitting || !canSubmit || !online}
          aria-busy={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F2C202] py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-[#D8AD02] disabled:cursor-not-allowed disabled:opacity-50 min-h-[48px]"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Creating..." : `Submit Block${linesWithProduct.length > 1 ? ` (${linesWithProduct.length} products)` : ""}`}
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

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Product {index + 1}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove product ${index + 1}`}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 min-h-[32px]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {row.selected ? (
        <div className="flex items-start gap-3 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white border border-[#EAEAEA]">
            <Package className="h-5 w-5 text-[#6B6B6B]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#111111]">{row.selected.name}</p>
            <p className="font-mono text-[10px] text-[#6B6B6B]">{row.selected.productNumber}</p>
            <p className="text-[10px] text-[#6B6B6B]">
              {[row.selected.brand, row.selected.size].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Change product"
            className="shrink-0 rounded-lg p-2 text-[#6B6B6B] hover:bg-white hover:text-[#111111] min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor={`product-search-${row.key}`} className="sr-only">
            Search products
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-3 focus-within:border-[#F2C202]">
            <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
            <input
              id={`product-search-${row.key}`}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={row.query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search by name, number, brand, size…"
              className="w-full bg-transparent py-3 text-sm outline-hidden min-h-[44px]"
            />
            {row.searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F2C202]" />}
          </div>

          {row.query.trim().length >= 2 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs z-10 relative">
              {row.searching && row.results.length === 0 && (
                <div className="space-y-2 p-3">
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
                <p className="p-4 text-center text-xs italic text-[#6B6B6B]">No matching products. Try a different search.</p>
              )}
              {row.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 border-b border-[#EAEAEA] p-3 text-left last:border-b-0 hover:bg-[#F7F7F5] active:bg-[#EAEAEA] min-h-[56px]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F5] border border-[#EAEAEA]">
                    <Package className="h-4 w-4 text-[#6B6B6B]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#111111]">{p.name}</p>
                    <p className="font-mono text-[10px] text-[#6B6B6B]">{p.productNumber}</p>
                    <p className="text-[10px] text-[#6B6B6B]">{[p.brand, p.size].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                      p.availableToBlock > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-[#EAEAEA] bg-[#F7F7F5] text-[#9A9A9A]"
                    }`}
                  >
                    {p.availableToBlock} free
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {row.selected && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`qty-${row.key}`} className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              Quantity (Boxes) *
            </label>
            {row.available !== null && <span className="text-[10px] font-bold text-[#8A7300]">{row.available} available</span>}
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
            className={`w-full rounded-xl border bg-white p-3 text-sm outline-hidden min-h-[44px] ${
              qtyInvalid ? "border-rose-300 focus:border-rose-400" : "border-[#EAEAEA] focus:border-[#F2C202]"
            }`}
            placeholder="e.g. 30"
          />
          {shortage > 0 && (
            <p className="text-[10px] font-bold text-amber-700">
              {row.available} available now · {shortage} will need to be ordered.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
