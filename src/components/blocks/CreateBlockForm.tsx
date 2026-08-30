"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { OFFLINE_MESSAGE } from "@/lib/offline";
import { Search, Package, X, Loader2, AlertCircle, WifiOff } from "lucide-react";
import {
  searchBlockableProductsAction,
  getAvailableToBlockAction,
  createBlockFromFormAction,
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

interface Props {
  dealers: Array<{ id: string; dealerId: string | null; name: string }>;
  /** Showroom the block will be raised under, resolved from the session. */
  showroomName: string | null;
  createdByName: string;
  createdByRole: string;
}

export function CreateBlockForm({ dealers, showroomName, createdByName, createdByRole }: Props) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductHit | null>(null);
  const [available, setAvailable] = useState<number | null>(null);

  const [dealerId, setDealerId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [durationHours, setDurationHours] = useState("48");
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // A request above what's physically available is allowed (overstock spec
  // §5) but needs an explicit confirmation click, so a mistyped quantity
  // doesn't silently commit the showroom to procuring extra stock.
  const [overstockConfirmed, setOverstockConfirmed] = useState(false);
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

  // Debounced server-side search — the catalogue is far too large to ship to
  // the browser, so every keystroke queries the database instead (spec §7).
  //
  // `searchSeq` discards out-of-order responses: typing "ACR" then "BEI" fires
  // two requests, and without this the slower "ACR" reply can land last and
  // overwrite the results the operator is actually looking at (spec §24).
  const searchSeq = useRef(0);
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      searchSeq.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const hits = await searchBlockableProductsAction(q);
        if (seq !== searchSeq.current) return; // a newer query has since fired
        setResults(hits);
      } catch {
        if (seq !== searchSeq.current) return;
        setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, selected]);

  const pickProduct = async (p: ProductHit) => {
    setSelected(p);
    setResults([]);
    setQuery("");
    setAvailable(p.availableToBlock);
    // Re-read from the database on selection: the search result may be a few
    // seconds stale, and the operator is about to type a quantity against it.
    try {
      setAvailable(await getAvailableToBlockAction(p.id));
    } catch {
      /* keep the search-time figure */
    }
  };

  const clearProduct = () => {
    setSelected(null);
    setAvailable(null);
    setQuantity("");
    setOverstockConfirmed(false);
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(value);
    setOverstockConfirmed(false);
  };

  const qtyNum = Number(quantity);
  // A quantity above what's available is not invalid — it's an overstock
  // request that needs procurement (spec §1/§5) — so only a non-positive or
  // non-numeric entry blocks the form.
  const qtyInvalid = quantity !== "" && (!Number.isFinite(qtyNum) || qtyNum <= 0);
  const shortage = available !== null && Number.isFinite(qtyNum) && qtyNum > 0 ? Math.max(0, qtyNum - available) : 0;
  const needsOverstockConfirm = shortage > 0 && !overstockConfirmed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return; // guards double tap before re-render
    setError(null);

    if (!online) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    if (!selected) return setError("Please select a product.");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Enter a quantity greater than zero.");
    if (needsOverstockConfirm) {
      return setError(`${shortage} of these ${qtyNum} boxes will need to be procured — confirm below to continue.`);
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await createBlockFromFormAction({
        productId: selected.id,
        quantity: qtyNum,
        dealerId: dealerId || undefined,
        remarks: remarks || undefined,
        durationHours: Number(durationHours) || 48,
      });

      if (!result.ok) {
        // Form state is intentionally preserved so the operator can adjust the
        // quantity rather than re-enter everything.
        setError(result.error);
        try {
          setAvailable(await getAvailableToBlockAction(selected.id));
        } catch {
          /* leave the previous figure */
        }
        return;
      }

      toast.success(`Block ${result.data.blockNumber} created.`);
      router.push(`/blocks/${result.data.id}`);
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

      {/* PRODUCT SELECTION */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 space-y-3 shadow-xs">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Product</h2>

        {selected ? (
          <div className="flex items-start gap-3 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white border border-[#EAEAEA]">
              <Package className="h-5 w-5 text-[#6B6B6B]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#111111]">{selected.name}</p>
              <p className="font-mono text-[10px] text-[#6B6B6B]">{selected.productNumber}</p>
              <p className="text-[10px] text-[#6B6B6B]">
                {[selected.brand, selected.size].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={clearProduct}
              aria-label="Change product"
              className="shrink-0 rounded-lg p-2 text-[#6B6B6B] hover:bg-white hover:text-[#111111] min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <label htmlFor="product-search" className="sr-only">Search products</label>
            <div className="flex items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-3 focus-within:border-[#F2C202]">
              <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
              <input
                id="product-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, number, brand, size…"
                className="w-full bg-transparent py-3 text-sm outline-hidden min-h-[44px]"
              />
              {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F2C202]" />}
            </div>

            {query.trim().length >= 2 && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
                {searching && results.length === 0 && (
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
                {!searching && results.length === 0 && (
                  <p className="p-4 text-center text-xs italic text-[#6B6B6B]">
                    No matching products. Try a different search.
                  </p>
                )}
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className="flex w-full items-center gap-3 border-b border-[#EAEAEA] p-3 text-left last:border-b-0 hover:bg-[#F7F7F5] active:bg-[#EAEAEA] min-h-[56px]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F5] border border-[#EAEAEA]">
                      <Package className="h-4 w-4 text-[#6B6B6B]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#111111]">{p.name}</p>
                      <p className="font-mono text-[10px] text-[#6B6B6B]">{p.productNumber}</p>
                      <p className="text-[10px] text-[#6B6B6B]">
                        {[p.brand, p.size].filter(Boolean).join(" · ") || "—"}
                      </p>
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
      </section>

      {/* QUANTITY + DEALER */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 space-y-4 shadow-xs">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Reservation</h2>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="block-qty" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              Block Quantity (Boxes) *
            </label>
            {available !== null && (
              <span className="text-[10px] font-bold text-[#8A7300]">{available} available to block</span>
            )}
          </div>
          <input
            id="block-qty"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            disabled={!selected}
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            aria-invalid={qtyInvalid}
            className={`w-full rounded-xl border bg-white p-3 text-sm outline-hidden min-h-[44px] disabled:bg-[#F7F7F5] disabled:cursor-not-allowed ${
              qtyInvalid ? "border-rose-300 focus:border-rose-400" : "border-[#EAEAEA] focus:border-[#F2C202]"
            }`}
            placeholder={selected ? "e.g. 30" : "Select a product first"}
          />

          {/* A request above physical stock is allowed — it becomes a
              procurement requirement rather than a rejection (spec §5). */}
          {!qtyInvalid && shortage > 0 && (
            <div className="mt-2 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-[11px] font-bold text-amber-900">
                {available} {available === 1 ? "box is" : "boxes are"} available now. {shortage} additional{" "}
                {shortage === 1 ? "box needs" : "boxes need"} to be ordered.
              </p>
              <p className="text-[10px] text-amber-800">
                This block will still be created for the full {qtyNum} boxes. The shortfall goes to the Manager's
                procurement queue automatically — this doesn't fail or delay your request.
              </p>
              {!overstockConfirmed ? (
                <button
                  type="button"
                  onClick={() => setOverstockConfirmed(true)}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-900 hover:bg-amber-100 min-h-[36px]"
                >
                  Continue with {qtyNum} boxes
                </button>
              ) : (
                <p className="text-[10px] font-bold text-emerald-700">Confirmed — ready to create.</p>
              )}
            </div>
          )}
        </div>

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

      {/* DERIVED CONTEXT — read-only, resolved server-side */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 sm:p-5 space-y-2">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Recorded Automatically</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <dt className="text-[#6B6B6B]">Created by</dt>
          <dd className="text-right font-bold text-[#111111]">{createdByName}</dd>
          <dt className="text-[#6B6B6B]">Role</dt>
          <dd className="text-right font-bold text-[#111111]">{createdByRole.replace(/_/g, " ")}</dd>
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

      {/* Sticky on mobile so the primary action is always reachable. */}
      <div className="sticky bottom-0 -mx-4 border-t border-[#EAEAEA] bg-white/95 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={submitting || !selected || !online || qtyInvalid || needsOverstockConfirm}
          aria-busy={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F2C202] py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-[#D8AD02] disabled:cursor-not-allowed disabled:opacity-50 min-h-[48px]"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Creating..." : "Create Block"}
        </button>
      </div>
    </form>
  );
}
