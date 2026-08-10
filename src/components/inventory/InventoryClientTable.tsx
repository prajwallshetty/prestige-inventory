"use client";

import React, { useState } from "react";
import { adjustStockAction, createBlockAction } from "@/app/actions";
import { Search, Filter, X, Lock, SlidersHorizontal, PackageCheck, AlertCircle } from "lucide-react";

export function InventoryClientTable({ initialData, brands, categories }: any) {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any>(null);
  const [blockingProduct, setBlockingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-4">
      {/* TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Product SKU / Code</th>
              <th className="px-4 py-3.5">Tile Name</th>
              <th className="px-4 py-3.5">Brand</th>
              <th className="px-4 py-3.5">Size</th>
              <th className="px-4 py-3.5 text-right">Available</th>
              <th className="px-4 py-3.5 text-right">In Transit</th>
              <th className="px-4 py-3.5 text-right">Blocked</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
            {initialData.items.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3 font-bold text-white">{item.sku}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedProduct(item)}
                    className="text-blue-400 hover:underline font-semibold text-left"
                  >
                    {item.productName}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-400">{item.brandName}</td>
                <td className="px-4 py-3 text-slate-400">{item.size}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-400">{item.availableStock} Boxes</td>
                <td className="px-4 py-3 text-right text-indigo-400">{item.transitStock} Boxes</td>
                <td className="px-4 py-3 text-right text-amber-400">{item.blockedStock} Boxes</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setAdjustingProduct(item)}
                      className="rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      Adjust
                    </button>
                    <button
                      onClick={() => setBlockingProduct(item)}
                      className="rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 text-[10px] font-semibold hover:bg-blue-600 hover:text-white transition-all"
                    >
                      Block
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DETAIL DRAWER */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg border-l border-slate-800 bg-[#0f172a] p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedProduct.productName}</h3>
                <p className="text-xs text-slate-400">SKU: {selectedProduct.sku}</p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {selectedProduct.lifestyleImage && (
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <img
                    src={selectedProduct.lifestyleImage}
                    alt={selectedProduct.productName}
                    className="h-48 w-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-900/60 p-4 border border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-400">Brand</p>
                  <p className="text-xs font-semibold text-white">{selectedProduct.brandName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Size</p>
                  <p className="text-xs font-semibold text-white">{selectedProduct.size}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Category</p>
                  <p className="text-xs font-semibold text-white">{selectedProduct.categoryName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Warehouse</p>
                  <p className="text-xs font-semibold text-white">{selectedProduct.warehouseName}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Internal Inventory Metrics</h4>
                <div className="space-y-2 text-xs">
                  <InventoryRow label="Stock Available" value={`${selectedProduct.availableStock} Boxes`} highlight="emerald" />
                  <InventoryRow label="Stock Blocked (Dealers)" value={`${selectedProduct.blockedStock} Boxes`} highlight="amber" />
                  <InventoryRow label="Stock Allocated" value={`${selectedProduct.allocatedStock} Boxes`} highlight="blue" />
                  <InventoryRow label="In Transit Stock" value={`${selectedProduct.transitStock} Boxes`} highlight="indigo" />
                  <InventoryRow label="Damaged Stock" value={`${selectedProduct.damagedStock} Boxes`} highlight="rose" />
                  <InventoryRow label="Reorder Level" value={`${selectedProduct.reorderLevel} Boxes`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADJUSTMENT MODAL */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Adjust Stock — {adjustingProduct.productName}</h3>
            <p className="text-xs text-slate-400 mt-1">
              Current Available Stock: <span className="font-bold text-emerald-400">{adjustingProduct.availableStock} Boxes</span>
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
              <div>
                <label className="block text-xs font-medium text-slate-300">Adjustment Quantity (+ or -)</label>
                <input
                  type="number"
                  name="quantity"
                  required
                  placeholder="e.g. -3 or 10"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-white placeholder-slate-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Reason for Adjustment</label>
                <select
                  name="reason"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-white"
                >
                  <option value="Breakage / Damage">Breakage / Damage</option>
                  <option value="Physical Audit Discrepancy">Physical Audit Discrepancy</option>
                  <option value="Sample Return">Sample Return</option>
                  <option value="Manual Warehouse Adjustment">Manual Warehouse Adjustment</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  {loading ? "Updating..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BLOCK REQUEST MODAL */}
      {blockingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create Stock Block — {blockingProduct.productName}</h3>
            <p className="text-xs text-slate-400 mt-1">
              Available to Block: <span className="font-bold text-emerald-400">{blockingProduct.availableStock} Boxes</span>
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
              <div>
                <label className="block text-xs font-medium text-slate-300">Quantity to Block (Boxes)</label>
                <input
                  type="number"
                  name="quantity"
                  max={blockingProduct.availableStock}
                  required
                  placeholder="e.g. 50"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-white placeholder-slate-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Block Duration (Hours)</label>
                <select
                  name="durationHours"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-white"
                >
                  <option value="24">24 Hours</option>
                  <option value="48">48 Hours (Default)</option>
                  <option value="72">72 Hours</option>
                  <option value="168">7 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Dealer / Sales Remarks</label>
                <textarea
                  name="remarks"
                  placeholder="e.g. Reserved for South City Project Dealer enquiry"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-white placeholder-slate-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockingProduct(null)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  {loading ? "Submitting..." : "Submit Block Request"}
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
    AVAILABLE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    LOW_STOCK: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    OUT_OF_STOCK: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    INCOMING: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    BLOCKED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${badgeMap[status] || badgeMap.AVAILABLE}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {status}
    </span>
  );
}

function InventoryRow({ label, value, highlight }: any) {
  const colors: any = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    indigo: "text-indigo-400",
    rose: "text-rose-400",
  };

  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-800/40">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold ${colors[highlight] || "text-white"}`}>{value}</span>
    </div>
  );
}
