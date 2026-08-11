"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createBookingAction } from "@/app/actions";
import { 
  ShoppingCart, 
  Search, 
  Trash2, 
  AlertTriangle, 
  Plus, 
  Minus, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  HelpCircle
} from "lucide-react";
import { SessionContext } from "@/lib/session";

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  size: string;
  brandName: string;
  categoryName: string;
  image: string;
  availableStock: number;
  transitStock: number;
  warehouseId: string;
  warehouseName: string;
}

interface CartItem {
  product: ProductItem;
  quantity: number;
  remarks: string;
  isWaitlist: boolean; // Flag to join waitlist for this item
}

interface NewBookingClientProps {
  products: ProductItem[];
  warehouses: Array<{ id: string; name: string; code: string }>;
  session: SessionContext;
}

export function NewBookingClient({ products, warehouses, session }: NewBookingClientProps) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(session.warehouseId || warehouses[0]?.id || "");
  const [priority, setPriority] = useState<"NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter products by search query
  const filteredProducts = products.filter((p) => {
    const terms = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(terms) ||
      p.sku.toLowerCase().includes(terms) ||
      p.brandName.toLowerCase().includes(terms) ||
      p.categoryName.toLowerCase().includes(terms)
    );
  });

  const addToCart = (product: ProductItem) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) return;

    setCart([
      ...cart,
      {
        product,
        quantity: 1,
        remarks: "",
        isWaitlist: false,
      },
    ]);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty < 1) return;
    setCart(
      cart.map((item) => {
        if (item.product.id === productId) {
          const isOverStock = qty > item.product.availableStock;
          return {
            ...item,
            quantity: qty,
            // If they increase quantity above available stock, we default waitlist flag to true
            isWaitlist: isOverStock ? true : item.isWaitlist,
          };
        }
        return item;
      })
    );
  };

  const updateRemarks = (productId: string, remarks: string) => {
    setCart(
      cart.map((item) => {
        if (item.product.id === productId) {
          return { ...item, remarks };
        }
        return item;
      })
    );
  };

  const toggleWaitlist = (productId: string) => {
    setCart(
      cart.map((item) => {
        if (item.product.id === productId) {
          return { ...item, isWaitlist: !item.isWaitlist };
        }
        return item;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    setIsSubmitting(true);
    try {
      // If ANY item in the cart is waitlisted (exceeds stock), we flag the whole booking as waitlisted (status ON_HOLD)
      const hasWaitlistedItems = cart.some((item) => item.isWaitlist);

      const payload = {
        dealerId: session.dealerId || "abc-dealer-id-placeholder", // If SuperAdmin creating booking, defaults to first dealer
        warehouseId: selectedWarehouseId,
        requestedBy: session.role === "DEALER" ? `Dealer Representative` : `Sales Manager (${session.role})`,
        priority,
        notes,
        isWaitlist: hasWaitlistedItems,
        items: cart.map((item) => ({
          productId: item.product.id,
          requestedQuantity: item.quantity,
          remarks: item.remarks || undefined,
        })),
      };

      const booking = await createBookingAction(payload);
      setSuccessMessage(`Booking ${booking.bookingNumber} created successfully! Redirecting...`);
      setCart([]);
      
      setTimeout(() => {
        router.push(`/bookings/${booking.id}`);
      }, 2000);
    } catch (err: any) {
      alert(`Error submitting booking: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* PRODUCT PICKER (7 cols) */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4 shadow-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by SKU, name, brand, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredProducts.length === 0 ? (
            <div className="col-span-2 py-12 text-center text-xs text-slate-500 rounded-xl border border-slate-800 bg-[#0f172a]">
              No products found.
            </div>
          ) : (
            filteredProducts.map((p) => {
              const inCart = cart.some((item) => item.product.id === p.id);
              const isOut = p.availableStock <= 0;
              return (
                <div 
                  key={p.id} 
                  className={`flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0f172a] overflow-hidden shadow-lg transition-all ${
                    inCart ? "ring-1 ring-amber-500/50" : "hover:border-slate-700"
                  }`}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 uppercase">
                          {p.brandName}
                        </span>
                        <h3 className="mt-1.5 text-sm font-bold text-white tracking-tight">{p.name}</h3>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5">
                        {p.size}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950/60 rounded-lg p-2.5 border border-slate-850">
                      <div>
                        <p className="text-slate-550 font-semibold uppercase tracking-wider text-[8px]">Available Stock</p>
                        <p className={`font-bold mt-0.5 ${isOut ? "text-rose-400" : "text-emerald-400"}`}>
                          {p.availableStock} Boxes
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-550 font-semibold uppercase tracking-wider text-[8px]">In Transit</p>
                        <p className="text-indigo-400 font-bold mt-0.5">
                          {p.transitStock > 0 ? `${p.transitStock} Boxes` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-850 bg-slate-900/40 px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[9.5px] text-slate-400 font-medium truncate">
                      Loc: {p.warehouseName.split(" ")[0]}
                    </span>
                    <button
                      type="button"
                      disabled={inCart}
                      onClick={() => addToCart(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        inCart
                          ? "bg-slate-850 text-slate-500 cursor-not-allowed border border-slate-800"
                          : "bg-amber-500 text-slate-950 hover:bg-amber-400"
                      }`}
                    >
                      {inCart ? "Added" : "Add to Hold"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* BOOKING CART & DETAILS (5 cols) */}
      <form onSubmit={handleSubmit} className="lg:col-span-5 space-y-4">
        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-amber-500" />
              <span>Hold Request Cart</span>
            </h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
              {cart.length} Items
            </span>
          </div>

          {/* Cart items list */}
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Cart is empty. Select products from the list to begin reservation request.
              </div>
            ) : (
              cart.map((item) => {
                const exceedsStock = item.quantity > item.product.availableStock;
                return (
                  <div key={item.product.id} className="rounded-lg border border-slate-850 bg-slate-900/60 p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-white">{item.product.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {item.product.sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                          className="w-12 bg-transparent text-center text-xs font-bold text-white focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400">Available: {item.product.availableStock}</span>
                    </div>

                    {/* Exceeds Stock Warning & Waitlist selector */}
                    {exceedsStock && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 space-y-2">
                        <div className="flex items-start gap-1.5 text-[10px] font-bold text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>Insufficient Available Stock!</span>
                        </div>
                        <p className="text-[9.5px] text-slate-300">
                          You requested {item.quantity} boxes, but only {item.product.availableStock} boxes are in stock.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWaitlist(item.product.id)}
                            className={`w-full rounded px-2.5 py-1 text-[9px] font-bold transition-all border ${
                              item.isWaitlist
                                ? "bg-amber-500 text-slate-950 border-amber-500"
                                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                            }`}
                          >
                            {item.isWaitlist ? "✓ Join Waitlist" : "Join Waitlist"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateQuantity(item.product.id, item.product.availableStock);
                              setCart(cart.map(c => c.product.id === item.product.id ? { ...c, quantity: item.product.availableStock, isWaitlist: false } : c));
                            }}
                            className="w-full rounded bg-slate-800 px-2.5 py-1 text-[9px] font-bold text-slate-300 border border-slate-700 hover:bg-slate-700"
                          >
                            Limit to {item.product.availableStock}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Item Remarks */}
                    <input
                      type="text"
                      placeholder="Remarks (e.g. Booking for Room A)"
                      value={item.remarks}
                      onChange={(e) => updateRemarks(item.product.id, e.target.value)}
                      className="w-full rounded bg-slate-950 border border-slate-800/80 p-1.5 text-[10px] text-slate-350 focus:border-amber-500 focus:outline-hidden"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Booking Options */}
          {cart.length > 0 && (
            <div className="space-y-4 pt-3 border-t border-slate-800">
              {/* Target Warehouse */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-450 tracking-wider flex items-center gap-1">
                  <span>Warehouse Source</span>
                  <span title="Which warehouse holds requested items">
                    <HelpCircle className="h-3 w-3 text-slate-500" />
                  </span>
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-455 tracking-wider">Priority Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["NORMAL", "HIGH", "URGENT"] as const).map((p) => {
                    const colorMap = {
                      NORMAL: "border-slate-850 text-slate-400 hover:text-white",
                      HIGH: "border-amber-500/20 text-amber-400 hover:bg-amber-500/5",
                      URGENT: "border-rose-500/20 text-rose-400 hover:bg-rose-500/5",
                    };
                    const activeColorMap = {
                      NORMAL: "bg-slate-800 text-white border-slate-600",
                      HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/50 shadow-xs",
                      URGENT: "bg-rose-500/10 text-rose-400 border-rose-500/50 shadow-xs",
                    };
                    const isSelected = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`rounded-lg border py-1.5 text-[10px] font-bold transition-all ${
                          isSelected ? activeColorMap[p] : colorMap[p]
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-455 tracking-wider">Admin Booking Notes</label>
                <textarea
                  placeholder="Additional notes for Warehouse Manager..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Submit Buttons */}
              <button
                type="submit"
                disabled={isSubmitting || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/15 disabled:bg-slate-850 disabled:text-slate-550 disabled:shadow-none"
              >
                {isSubmitting ? "Creating Booking Request..." : "Submit Booking Request"}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
