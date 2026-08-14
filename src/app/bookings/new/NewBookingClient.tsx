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
  ArrowRight,
  HelpCircle
} from "lucide-react";
import { SessionContext } from "@/lib/session";
import { getProductThumbnailUrl } from "@/lib/s3";
import { ShimmerImage } from "@/components/Skeleton";

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  size: string;
  brandName: string;
  categoryName: string;
  image_key?: string | null;
  thumbnail_key?: string | null;
  lifestyleImage?: string | null;
  textureImage?: string | null;
  availableStock: number;
  transitStock: number;
  warehouseId: string;
  warehouseName: string;
}

interface CartItem {
  product: ProductItem;
  quantity: number;
  remarks: string;
  isWaitlist: boolean;
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
      const hasWaitlistedItems = cart.some((item) => item.isWaitlist);

      const payload = {
        dealerId: session.dealerId || "abc-dealer-id-placeholder",
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
      
      // Snappy transition
      setTimeout(() => {
        router.push(`/bookings/${booking.id}`);
      }, 100);
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
        <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]" />
            <input
              type="text"
              placeholder="Search products by SKU, name, brand, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2.5 pl-10 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredProducts.length === 0 ? (
            <div className="col-span-2 py-12 text-center text-xs text-[#6B6B6B] rounded-xl border border-[#EAEAEA] bg-white">
              No products found.
            </div>
          ) : (
            filteredProducts.map((p) => {
              const inCart = cart.some((item) => item.product.id === p.id);
              const isOut = p.availableStock <= 0;
              return (
                <div 
                  key={p.id} 
                  className={`flex flex-col justify-between rounded-xl border border-[#EAEAEA] bg-white overflow-hidden shadow-xs transition-all ${
                    inCart ? "ring-2 ring-[#F2C202]/40" : "hover:border-slate-300"
                  }`}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex gap-3">
                      {/* Product Thumbnail with Shimmer */}
                      <ShimmerImage
                        src={getProductThumbnailUrl(p)}
                        alt={p.name}
                        wrapperClassName="h-16 w-16 relative overflow-hidden rounded-lg border border-[#EAEAEA] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex rounded-md bg-[#F2C202]/10 px-2 py-0.5 text-[9px] font-bold text-[#8A7300] uppercase">
                          {p.brandName}
                        </span>
                        <h3 className="mt-1 text-xs font-black text-[#111111] tracking-tight truncate">{p.name}</h3>
                        <p className="text-[10px] text-[#6B6B6B] font-mono mt-0.5">{p.sku}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-[#6B6B6B]">
                      <span>Size: <strong className="text-[#111111]">{p.size}</strong></span>
                      <span>Style: <strong className="text-[#111111]">{p.categoryName}</strong></span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#F7F7F5] rounded-lg p-2.5 border border-[#EAEAEA]">
                      <div>
                        <p className="text-[#6B6B6B] font-semibold uppercase tracking-wider text-[8px]">Available Stock</p>
                        <p className={`font-bold mt-0.5 ${isOut ? "text-rose-600" : "text-emerald-600"}`}>
                          {p.availableStock} Boxes
                        </p>
                      </div>
                      <div>
                        <p className="text-[#6B6B6B] font-semibold uppercase tracking-wider text-[8px]">In Transit</p>
                        <p className="text-indigo-600 font-bold mt-0.5">
                          {p.transitStock > 0 ? `${p.transitStock} Boxes` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EAEAEA] bg-[#F7F7F5]/40 px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[9.5px] text-[#6B6B6B] font-medium truncate">
                      Loc: {p.warehouseName.split(" ")[0]}
                    </span>
                    <button
                      type="button"
                      disabled={inCart}
                      onClick={() => addToCart(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        inCart
                          ? "bg-[#F7F7F5] text-[#6B6B6B]/40 cursor-not-allowed border border-[#EAEAEA]"
                          : "bg-[#F2C202] text-white hover:bg-[#D8AD02]"
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
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-950">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <h2 className="text-base font-bold text-[#111111] flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[#F2C202]" />
              <span>Hold Request Cart</span>
            </h2>
            <span className="rounded-full bg-[#F7F7F5] px-2.5 py-0.5 text-xs font-semibold text-[#6B6B6B] border border-[#EAEAEA]">
              {cart.length} Items
            </span>
          </div>

          {/* Cart items list */}
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B6B6B]">
                Cart is empty. Select products from the list to begin reservation request.
              </div>
            ) : (
              cart.map((item) => {
                const exceedsStock = item.quantity > item.product.availableStock;
                return (
                  <div key={item.product.id} className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-[#111111]">{item.product.name}</h4>
                        <p className="text-[10px] text-[#6B6B6B] font-mono mt-0.5">SKU: {item.product.sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-[#6B6B6B] hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1 bg-white border border-[#EAEAEA] rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="rounded p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                          className="w-12 bg-transparent text-center text-xs font-bold text-[#111111] focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="rounded p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-[#6B6B6B]">Available: {item.product.availableStock}</span>
                    </div>

                    {/* Exceeds Stock Warning & Waitlist selector */}
                    {exceedsStock && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-2">
                        <div className="flex items-start gap-1.5 text-[10px] font-bold text-amber-850">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span>Insufficient Available Stock!</span>
                        </div>
                        <p className="text-[9.5px] text-amber-900">
                          You requested {item.quantity} boxes, but only {item.product.availableStock} boxes are in stock.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWaitlist(item.product.id)}
                            className={`w-full rounded px-2.5 py-1 text-[9px] font-bold transition-all border ${
                              item.isWaitlist
                                ? "bg-amber-600 text-white border-amber-600"
                                : "bg-white text-[#6B6B6B] border-[#EAEAEA] hover:bg-[#F7F7F5]"
                            }`}
                          >
                            {item.isWaitlist ? "✓ Join Waitlist" : "Join Waitlist"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateQuantity(item.product.id, item.product.availableStock);
                            }}
                            className="w-full rounded bg-white px-2.5 py-1 text-[9px] font-bold text-[#6B6B6B] border border-[#EAEAEA] hover:bg-[#F7F7F5]"
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
                      className="w-full rounded border border-[#EAEAEA] bg-white p-1.5 text-[10px] text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Booking Options */}
          {cart.length > 0 && (
            <div className="space-y-4 pt-3 border-t border-[#EAEAEA]">
              {/* Target Warehouse */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider flex items-center gap-1">
                  <span>Warehouse Source</span>
                  <span title="Which warehouse holds requested items">
                    <HelpCircle className="h-3 w-3 text-[#6B6B6B]" />
                  </span>
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
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
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Priority Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["NORMAL", "HIGH", "URGENT"] as const).map((p) => {
                    const colorMap = {
                      NORMAL: "border-[#EAEAEA] text-[#6B6B6B] hover:text-[#111111]",
                      HIGH: "border-amber-200 text-amber-700 hover:bg-amber-50",
                      URGENT: "border-rose-200 text-rose-700 hover:bg-rose-50",
                    };
                    const activeColorMap = {
                      NORMAL: "bg-[#F7F7F5] text-[#111111] border-[#CCCCCC]",
                      HIGH: "bg-amber-100 text-amber-800 border-amber-300 shadow-xs",
                      URGENT: "bg-rose-100 text-rose-800 border-rose-300 shadow-xs",
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
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Admin Booking Notes</label>
                <textarea
                  placeholder="Additional notes for Warehouse Manager..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              {/* Submit Buttons */}
              <button
                type="submit"
                disabled={isSubmitting || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-sm disabled:bg-[#F7F7F5] disabled:text-[#6B6B6B]/40 disabled:border-[#EAEAEA] disabled:shadow-none cursor-pointer"
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
