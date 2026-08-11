"use client";

import React, { useState, useMemo } from "react";
import { adjustStockAction, createBlockAction } from "@/app/actions";
import { 
  Search, 
  Filter, 
  X, 
  Lock, 
  SlidersHorizontal, 
  PackageCheck, 
  AlertCircle, 
  MoreVertical, 
  Eye, 
  Plus, 
  Info,
  Calendar,
  Layers
} from "lucide-react";
import Link from "next/link";

interface Props {
  initialData: {
    items: any[];
  };
  brands: any[];
  categories: any[];
  session?: {
    role: string;
    dealerId?: string;
    warehouseId?: string;
  };
}

export function InventoryClientTable({ initialData, brands, categories, session }: Props) {
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any>(null);
  const [blockingProduct, setBlockingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<string | null>(null);

  const isDealer = session?.role === "DEALER";
  const isReadOnly = session?.role === "VIEWER";

  // Filter logic
  const filteredItems = useMemo(() => {
    return initialData.items.filter((item) => {
      const matchSearch =
        item.productName.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        (item.brandName && item.brandName.toLowerCase().includes(search.toLowerCase()));

      const matchBrand = selectedBrand ? item.brandName === selectedBrand : true;
      const matchCategory = selectedCategory ? item.categoryName === selectedCategory : true;
      const matchStatus = selectedStatus ? item.status === selectedStatus : true;

      return matchSearch && matchBrand && matchCategory && matchStatus;
    });
  }, [initialData.items, search, selectedBrand, selectedCategory, selectedStatus]);

  const handleActionClick = (productId: string) => {
    if (mobileMenuOpen === productId) {
      setMobileMenuOpen(null);
    } else {
      setMobileMenuOpen(productId);
    }
  };

  return (
    <div className="space-y-4">
      {/* FILTER CONTROL BAR */}
      <div className="rounded-xl border border-slate-850 bg-[#0c1122]/70 p-4 shadow-sm backdrop-blur-md flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search tile SKU, name, or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#1b253b]/55 bg-slate-950 py-1.5 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-slate-350 focus:border-amber-500 focus:outline-hidden"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-slate-350 focus:border-amber-500 focus:outline-hidden"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-slate-350 focus:border-amber-500 focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* DESKTOP VIEW: HIGH-QUALITY DATA TABLE */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-850 bg-[#0c1122] shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="border-b border-[#1b253b]/65 bg-[#080c16] text-[10px] font-black uppercase text-slate-450 tracking-wider">
            <tr>
              <th className="px-4 py-4 font-mono">Product SKU</th>
              <th className="px-4 py-4">Tile Description</th>
              <th className="px-4 py-4">Brand</th>
              <th className="px-4 py-4">Size</th>
              <th className="px-4 py-4 text-right">Available</th>
              <th className="px-4 py-4 text-right">In Transit</th>
              <th className="px-4 py-4 text-right">Blocked</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1b253b]/35 font-medium text-slate-200">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                <td className="px-4 py-3.5 font-bold font-mono text-white">{item.sku}</td>
                <td className="px-4 py-3.5">
                  <button
                    onClick={() => setSelectedProduct(item)}
                    className="text-amber-500 hover:text-amber-400 hover:underline font-bold text-left transition-colors cursor-pointer"
                  >
                    {item.productName}
                  </button>
                </td>
                <td className="px-4 py-3.5 text-slate-400">{item.brandName}</td>
                <td className="px-4 py-3.5 text-slate-400 font-mono">{item.size}</td>
                <td className="px-4 py-3.5 text-right font-black text-emerald-400 font-mono">{item.availableStock.toLocaleString()} Box</td>
                <td className="px-4 py-3.5 text-right text-indigo-400 font-mono">{item.transitStock.toLocaleString()} Box</td>
                <td className="px-4 py-3.5 text-right text-amber-400 font-mono">{item.blockedStock.toLocaleString()} Box</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-center gap-1.5">
                    {/* Action buttons based on Role */}
                    {isDealer ? (
                      <Link
                        href={`/bookings/new?selectProductId=${item.productId}`}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-slate-950 hover:bg-amber-400 transition-all touch-target flex items-center justify-center"
                      >
                        Book Stock
                      </Link>
                    ) : isReadOnly ? (
                      <button
                        onClick={() => setSelectedProduct(item)}
                        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-slate-450 hover:text-white transition-all touch-target"
                      >
                        Inspect
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setAdjustingProduct(item)}
                          className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all touch-target"
                        >
                          Adjust
                        </button>
                        <button
                          onClick={() => setBlockingProduct(item)}
                          className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-bold text-blue-400 hover:bg-blue-600 hover:text-white transition-all touch-target"
                        >
                          Block
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE-FIRST VIEW: SWIPEABLE CARDS */}
      <div className="md:hidden space-y-3">
        {filteredItems.map((item) => (
          <div 
            key={item.id} 
            className="rounded-xl border border-slate-850 bg-[#0c1122] p-4 shadow-md space-y-4 relative"
          >
            {/* Header: Title and action button trigger */}
            <div className="flex justify-between items-start gap-4">
              <div>
                <h4 className="text-xs font-black text-white">{item.productName}</h4>
                <p className="text-[10px] text-slate-450 font-mono mt-0.5">
                  {item.brandName} • {item.size}
                </p>
              </div>
              <div className="relative">
                <button
                  onClick={() => handleActionClick(item.id)}
                  className="rounded-lg p-1 text-slate-450 hover:bg-slate-900 touch-target"
                >
                  <MoreVertical className="h-4.5 w-4.5" />
                </button>
                {/* Popover Action list */}
                {mobileMenuOpen === item.id && (
                  <div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-slate-850 bg-slate-950 p-1 shadow-2xl text-xs space-y-0.5">
                    <button
                      onClick={() => { setSelectedProduct(item); setMobileMenuOpen(null); }}
                      className="w-full text-left rounded px-2.5 py-1.5 hover:bg-slate-900 text-slate-200"
                    >
                      Inspect Specs
                    </button>
                    {isDealer && (
                      <Link
                        href={`/bookings/new?selectProductId=${item.productId}`}
                        className="block w-full text-left rounded px-2.5 py-1.5 hover:bg-slate-900 text-amber-400 font-bold"
                      >
                        Book Stock
                      </Link>
                    )}
                    {!isDealer && !isReadOnly && (
                      <>
                        <button
                          onClick={() => { setAdjustingProduct(item); setMobileMenuOpen(null); }}
                          className="w-full text-left rounded px-2.5 py-1.5 hover:bg-slate-900 text-slate-300"
                        >
                          Adjust Stock
                        </button>
                        <button
                          onClick={() => { setBlockingProduct(item); setMobileMenuOpen(null); }}
                          className="w-full text-left rounded px-2.5 py-1.5 hover:bg-slate-900 text-blue-400 font-semibold"
                        >
                          Create Block
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Availability levels */}
            <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#1b253b]/35 text-center bg-slate-950/40 rounded-lg">
              <div>
                <p className="text-[9px] uppercase font-black text-slate-500">Available</p>
                <p className="text-xs font-black text-emerald-400 mt-0.5">{item.availableStock} Box</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-black text-slate-500">Transit</p>
                <p className="text-xs font-bold text-indigo-400 mt-0.5">{item.transitStock} Box</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-black text-slate-500">Blocked</p>
                <p className="text-xs font-bold text-amber-400 mt-0.5">{item.blockedStock} Box</p>
              </div>
            </div>

            {/* Inspect Link */}
            <div className="flex items-center justify-between">
              <StatusBadge status={item.status} />
              <button
                onClick={() => setSelectedProduct(item)}
                className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 uppercase tracking-wider touch-target"
              >
                <Eye className="h-3.5 w-3.5" /> Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* DETAIL DRAWER: RESPONSIVE SHEET */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-xs">
          <div className="w-full max-w-lg border-l border-slate-850 bg-[#0c1122] p-6 shadow-2xl overflow-y-auto flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between border-b border-slate-850 pb-4">
                <div>
                  <h3 className="text-base font-black text-white">{selectedProduct.productName}</h3>
                  <p className="text-[10px] text-slate-450 font-mono mt-0.5">SKU ID: {selectedProduct.sku}</p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white touch-target"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 space-y-6">
                {selectedProduct.lifestyleImage && (
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    <img
                      src={selectedProduct.lifestyleImage}
                      alt={selectedProduct.productName}
                      className="h-44 w-full object-cover"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3.5 rounded-xl bg-slate-900/40 p-4 border border-[#1b253b]/30">
                  <div>
                    <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Tile Brand</span>
                    <span className="text-xs font-bold text-white mt-1 block">{selectedProduct.brandName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Format Dimensions</span>
                    <span className="text-xs font-bold text-white mt-1 block font-mono">{selectedProduct.size}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Category Style</span>
                    <span className="text-xs font-bold text-white mt-1 block">{selectedProduct.categoryName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Depot Location</span>
                    <span className="text-xs font-bold text-white mt-1 block">{selectedProduct.warehouseName}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-amber-500" />
                    <span>Depot Stock Balances</span>
                  </h4>
                  <div className="rounded-xl border border-[#1b253b]/45 bg-slate-950 p-4 space-y-2 text-xs">
                    <InventoryRow label="Physical Available Stock" value={`${selectedProduct.availableStock.toLocaleString()} Box`} highlight="emerald" />
                    <InventoryRow label="Allocated (Ready for Shipment)" value={`${selectedProduct.allocatedStock.toLocaleString()} Box`} highlight="blue" />
                    <InventoryRow label="Temporary Block Holds" value={`${selectedProduct.blockedStock.toLocaleString()} Box`} highlight="amber" />
                    <InventoryRow label="In-Transit Deliveries" value={`${selectedProduct.transitStock.toLocaleString()} Box`} highlight="indigo" />
                    <InventoryRow label="Damaged / Write-Offs" value={`${selectedProduct.damagedStock.toLocaleString()} Box`} highlight="rose" />
                    <InventoryRow label="Reorder Threshold Alert" value={`${selectedProduct.reorderLevel.toLocaleString()} Box`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-850 mt-6 flex gap-2">
              {isDealer ? (
                <Link
                  href={`/bookings/new?selectProductId=${selectedProduct.productId}`}
                  onClick={() => setSelectedProduct(null)}
                  className="w-full rounded-xl bg-amber-500 py-3 text-center text-xs font-black text-slate-950 hover:bg-amber-400 transition-all shadow-md"
                >
                  Book Stock Hold
                </Link>
              ) : !isReadOnly && (
                <>
                  <button
                    onClick={() => { setAdjustingProduct(selectedProduct); setSelectedProduct(null); }}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 text-xs font-bold text-slate-350 hover:text-white"
                  >
                    Adjust Stock
                  </button>
                  <button
                    onClick={() => { setBlockingProduct(selectedProduct); setSelectedProduct(null); }}
                    className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-500"
                  >
                    Create Hold
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADJUSTMENT MODAL */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-850 bg-[#0c1122] p-6 shadow-2xl animate-shimmer">
            <div className="flex justify-between items-center border-b border-slate-850 pb-3">
              <h3 className="text-sm font-bold text-white">Adjust Stock — {adjustingProduct.productName}</h3>
              <button onClick={() => setAdjustingProduct(null)} className="text-slate-500 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            <p className="text-xs text-slate-400 mt-3">
              Current Available Depot Stock: <strong className="text-emerald-400">{adjustingProduct.availableStock} Boxes</strong>
            </p>

            <form
              action={async (formData) => {
                setLoading(true);
                await adjustStockAction(formData);
                setLoading(false);
                setAdjustingProduct(null);
              }}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="productId" value={adjustingProduct.id} />
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Adjustment Offset (Boxes)</label>
                <input
                  type="number"
                  name="quantity"
                  required
                  placeholder="e.g. -10 or +25"
                  className="w-full rounded-lg border border-[#1b253b]/65 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Discrepancy Reason</label>
                <select
                  name="reason"
                  required
                  className="w-full rounded-lg border border-[#1b253b]/65 bg-slate-950 p-2.5 text-xs text-white focus:outline-hidden"
                >
                  <option value="Breakage / Damage">Breakage / Damage</option>
                  <option value="Physical Audit Discrepancy">Physical Audit Discrepancy</option>
                  <option value="Sample Return">Sample Return</option>
                  <option value="Manual Warehouse Adjustment">Manual Warehouse Adjustment</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-450 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-400"
                >
                  {loading ? "Updating..." : "Commit Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BLOCK REQUEST MODAL */}
      {blockingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-855 bg-[#0c1122] p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-850 pb-3">
              <h3 className="text-sm font-bold text-white">Create Stock Hold Block</h3>
              <button onClick={() => setBlockingProduct(null)} className="text-slate-500 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Target Product: <strong className="text-white">{blockingProduct.productName}</strong>
            </p>
            <p className="text-xs text-slate-400">
              Available to Lock: <strong className="text-emerald-400">{blockingProduct.availableStock} Boxes</strong>
            </p>

            <form
              action={async (formData) => {
                setLoading(true);
                await createBlockAction(formData);
                setLoading(false);
                setBlockingProduct(null);
              }}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="productId" value={blockingProduct.id} />
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Lock Quantity (Boxes)</label>
                <input
                  type="number"
                  name="quantity"
                  max={blockingProduct.availableStock}
                  required
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-[#1b253b]/65 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Hold Duration Limit</label>
                <select
                  name="durationHours"
                  className="w-full rounded-lg border border-[#1b253b]/65 bg-slate-950 p-2.5 text-xs text-white focus:outline-hidden"
                >
                  <option value="24">24 Hours (Immediate)</option>
                  <option value="48">48 Hours (Standard)</option>
                  <option value="72">72 Hours (Extended)</option>
                  <option value="168">7 Days (Project Reservation)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Dealer / Project remarks</label>
                <textarea
                  name="remarks"
                  placeholder="e.g. Hold for South Central metro plaza dealer tender"
                  rows={2}
                  className="w-full rounded-lg border border-[#1b253b]/65 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-hidden"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setBlockingProduct(null)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-455 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  {loading ? "Submitting..." : "Submit Block Hold"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    AVAILABLE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
    LOW_STOCK: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    OUT_OF_STOCK: "bg-rose-500/10 text-rose-400 border-rose-500/15",
    INCOMING: "bg-indigo-500/10 text-indigo-400 border-indigo-500/15",
    BLOCKED: "bg-purple-500/10 text-purple-400 border-purple-500/15",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${badgeMap[status] || badgeMap.AVAILABLE}`}>
      <span className="h-1 w-1 rounded-full bg-current"></span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function InventoryRow({ label, value, highlight }: any) {
  const colors: any = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    indigo: "text-indigo-400",
    rose: "text-rose-455",
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
      <span className="text-slate-450 font-bold">{label}</span>
      <span className={`font-black ${colors[highlight] || "text-white"}`}>{value}</span>
    </div>
  );
}
