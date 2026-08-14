"use client";

import React, { useState, useMemo } from "react";
import { adjustStockAction, createBlockAction, getDealersAndWarehousesAction } from "@/app/actions";
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
import { getProductThumbnailUrl, getProductImageUrl } from "@/lib/s3";
import { ShimmerImage } from "@/components/Skeleton";

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
  const [dealers, setDealers] = useState<any[]>([]);
  const [showrooms, setShowrooms] = useState<any[]>([]);
  const [buttonState, setButtonState] = useState<"IDLE" | "CHECKING" | "CREATING" | "SUCCESS">("IDLE");

  React.useEffect(() => {
    if (session?.role === "SUPER_ADMIN" || session?.role === "MANAGER") {
      getDealersAndWarehousesAction().then(({ dealers, showrooms }) => {
        setDealers(dealers || []);
        setShowrooms(showrooms || []);
      });
    }
  }, [session]);

  const isDealer = session?.role === "DEALER";
  const isReadOnly = session?.role === "VIEWER";

  // Filter logic
  const filteredItems = useMemo(() => {
    return initialData.items.filter((item) => {
      const matchesSearch =
        !search ||
        item.productName.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.brandName.toLowerCase().includes(search.toLowerCase());

      const matchesBrand = !selectedBrand || item.brandName === selectedBrand;
      const matchesCategory = !selectedCategory || item.categoryName === selectedCategory;
      const matchesStatus = !selectedStatus || item.status === selectedStatus;

      return matchesSearch && matchesBrand && matchesCategory && matchesStatus;
    });
  }, [initialData.items, search, selectedBrand, selectedCategory, selectedStatus]);

  const handleActionClick = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileMenuOpen(mobileMenuOpen === itemId ? null : itemId);
  };

  return (
    <div className="space-y-6">
      {/* FILTER BAR CONTROLS */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search catalog by SKU, name or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* DESKTOP VIEW: PREMIUM DATA TABLE */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-4 w-16 text-center">Image</th>
              <th className="px-4 py-4 font-mono">Product SKU</th>
              <th className="px-4 py-4">Tile Description</th>
              <th className="px-4 py-4">Brand</th>
              <th className="px-4 py-4">Size</th>
              <th className="px-4 py-4 text-right">Available</th>
              <th className="px-4 py-4 text-right font-mono">Blocked</th>
              <th className="px-4 py-4 text-right">In Transit</th>
              <th className="px-4 py-4 text-center">Blocked By</th>
              <th className="px-4 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {filteredItems.map((item) => {
              // Extract unique blocked by persons from activeBlocks
              const uniqueBlockedBy = Array.from(
                new Set(item.activeBlocks.map((b: any) => b.blocked_by).filter(Boolean))
              ) as string[];

              return (
                <tr key={item.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                  <td className="px-2 py-2">
                    <ShimmerImage
                      src={getProductThumbnailUrl(item)}
                      alt={item.productName}
                      wrapperClassName="h-10 w-10 relative overflow-hidden rounded-lg mx-auto border border-[#EAEAEA]"
                    />
                  </td>
                  <td className="px-4 py-3.5 font-bold font-mono text-[#111111]">{item.sku}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setSelectedProduct(item)}
                      className="text-[#8A7300] hover:text-[#D8AD02] hover:underline font-bold text-left transition-colors cursor-pointer"
                    >
                      {item.productName}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-[#6B6B6B]">{item.brandName}</td>
                  <td className="px-4 py-3.5 text-[#6B6B6B] font-mono">{item.size}</td>
                  <td className="px-4 py-3.5 text-right font-black text-emerald-600 font-mono">{item.availableStock.toLocaleString()} Box</td>
                  <td className="px-4 py-3.5 text-right text-amber-600 font-mono">{item.blockedStock.toLocaleString()} Box</td>
                  <td className="px-4 py-3.5 text-right text-indigo-600 font-mono">{item.transitStock.toLocaleString()} Box</td>
                  <td className="px-4 py-3.5 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {uniqueBlockedBy.map((name) => (
                        <span key={name} className="inline-flex items-center rounded-md bg-[#F7F7F5] px-1.5 py-0.5 text-[10px] font-bold text-[#6B6B6B] border border-[#EAEAEA]">
                          {name === "SAMSHUDIN" ? "Samshudin" : "Salman"}
                        </span>
                      ))}
                      {uniqueBlockedBy.length === 0 && <span className="text-[#6B6B6B]/40">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      {isDealer ? (
                        <Link
                          href={`/bookings/new?selectProductId=${item.productId}`}
                          className="rounded-lg bg-[#F2C202] px-3 py-1.5 text-[10px] font-black text-white hover:bg-[#D8AD02] transition-all touch-target flex items-center justify-center"
                        >
                          Book Stock
                        </Link>
                      ) : isReadOnly ? (
                        <button
                          onClick={() => setSelectedProduct(item)}
                          className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-[10px] font-bold text-[#6B6B6B] hover:text-[#111111] transition-all touch-target"
                        >
                          Inspect
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setAdjustingProduct(item)}
                            className="rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setBlockingProduct(item)}
                            className="rounded-lg border border-blue-500/25 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-600 hover:bg-blue-600 hover:text-white transition-all touch-target"
                          >
                            Block
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE-FIRST VIEW: PREMIUM TAP-FRIENDLY CARDS */}
      <div className="md:hidden space-y-3">
        {filteredItems.map((item) => {
          const uniqueBlockedBy = Array.from(
            new Set(item.activeBlocks.map((b: any) => b.blocked_by).filter(Boolean))
          ) as string[];

          return (
            <div 
              key={item.id} 
              onClick={() => setSelectedProduct(item)}
              className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm space-y-3.5 relative active:bg-[#F7F7F5] transition-all cursor-pointer"
            >
              {/* Header section: Image + details */}
              <div className="flex items-center gap-3">
                <ShimmerImage
                  src={getProductThumbnailUrl(item)}
                  alt={item.productName}
                  wrapperClassName="h-14 w-14 relative overflow-hidden rounded-lg border border-[#EAEAEA] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-[#111111] truncate">{item.productName}</h4>
                  <p className="text-[10px] text-[#6B6B6B] mt-0.5">{item.brandName}</p>
                  <p className="text-[10px] text-[#6B6B6B] font-mono">{item.size}</p>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleActionClick(item.id, e)}
                    className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] touch-target"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {/* Action dropdown */}
                  {mobileMenuOpen === item.id && (
                    <div className="absolute right-4 top-12 z-30 w-36 rounded-lg border border-[#EAEAEA] bg-white p-1 shadow-md text-xs space-y-0.5">
                      <button
                        onClick={() => { setSelectedProduct(item); setMobileMenuOpen(null); }}
                        className="w-full text-left rounded px-2.5 py-1.5 hover:bg-[#F7F7F5] text-[#111111]"
                      >
                        Inspect Details
                      </button>
                      {isDealer && (
                        <Link
                          href={`/bookings/new?selectProductId=${item.productId}`}
                          className="block w-full text-left rounded px-2.5 py-1.5 hover:bg-[#F7F7F5] text-[#8A7300] font-bold"
                        >
                          Book Stock
                        </Link>
                      )}
                      {!isDealer && !isReadOnly && (
                        <>
                          <button
                            onClick={() => { setAdjustingProduct(item); setMobileMenuOpen(null); }}
                            className="w-full text-left rounded px-2.5 py-1.5 hover:bg-[#F7F7F5] text-[#111111]"
                          >
                            Adjust Stock
                          </button>
                          <button
                            onClick={() => { setBlockingProduct(item); setMobileMenuOpen(null); }}
                            className="w-full text-left rounded px-2.5 py-1.5 hover:bg-[#F7F7F5] text-blue-600 font-semibold"
                          >
                            Create Block
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Balances */}
              <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#EAEAEA] text-center bg-[#F7F7F5] rounded-lg">
                <div>
                  <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Available</p>
                  <p className="text-xs font-black text-emerald-600 mt-0.5">{item.availableStock} Box</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Blocked</p>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">{item.blockedStock} Box</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Transit</p>
                  <p className="text-xs font-bold text-indigo-600 mt-0.5">{item.transitStock} Box</p>
                </div>
              </div>

              {/* Blocked by status info */}
              <div className="flex justify-between items-center text-[10px]">
                <div>
                  {uniqueBlockedBy.length > 0 ? (
                    <span className="text-[#6B6B6B]">
                      Blocked By: <strong className="text-[#111111]">{uniqueBlockedBy.map(b => b === "SAMSHUDIN" ? "Samshudin" : "Salman").join(", ")}</strong>
                    </span>
                  ) : (
                    <span className="text-[#6B6B6B]/60">No active blocks</span>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* DETAIL DRAWER: RESPONSIVE SHEET */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg border-l border-[#EAEAEA] bg-white p-6 shadow-2xl overflow-y-auto flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
                <div>
                  <h3 className="text-base font-black text-[#111111]">{selectedProduct.productName}</h3>
                  <p className="text-[10px] text-[#6B6B6B] font-mono mt-0.5">SKU ID: {selectedProduct.sku}</p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] touch-target"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 space-y-6">
                {/* Large progressive load Product image */}
                <ShimmerImage
                  src={getProductImageUrl(selectedProduct)}
                  alt={selectedProduct.productName}
                  wrapperClassName="overflow-hidden rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] h-48 w-full relative"
                />

                <div className="grid grid-cols-2 gap-3.5 rounded-xl bg-[#F7F7F5] p-4 border border-[#EAEAEA]">
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Tile Brand</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block">{selectedProduct.brandName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Format Dimensions</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block font-mono">{selectedProduct.size}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Category Style</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block">{selectedProduct.categoryName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Depot Location</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block">{selectedProduct.warehouseName}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-[#6B6B6B] uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[#F2C202]" />
                    <span>Depot Stock Balances</span>
                  </h4>
                  <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 space-y-2 text-xs">
                    <InventoryRow label="Physical Available Stock" value={`${selectedProduct.availableStock.toLocaleString()} Box`} highlight="emerald" />
                    <InventoryRow label="Allocated (Ready for Shipment)" value={`${selectedProduct.allocatedStock.toLocaleString()} Box`} highlight="blue" />
                    <InventoryRow label="Temporary Block Holds" value={`${selectedProduct.blockedStock.toLocaleString()} Box`} highlight="amber" />
                    <InventoryRow label="In-Transit Deliveries" value={`${selectedProduct.transitStock.toLocaleString()} Box`} highlight="indigo" />
                    <InventoryRow label="Damaged / Write-Offs" value={`${selectedProduct.damagedStock.toLocaleString()} Box`} highlight="rose" />
                    <InventoryRow label="Reorder Threshold Alert" value={`${selectedProduct.reorderLevel.toLocaleString()} Box`} />
                  </div>
                </div>

                {/* Controlled Active Block Reservations Details */}
                {selectedProduct.activeBlocks && selectedProduct.activeBlocks.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-[#6B6B6B] uppercase tracking-widest flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-[#F2C202]" />
                      <span>Active Block Holds</span>
                    </h4>
                    <div className="space-y-3">
                      {selectedProduct.activeBlocks.map((block: any) => (
                        <div key={block.id} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 text-xs space-y-2">
                          <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-1.5">
                            <span className="font-bold text-amber-700 uppercase tracking-wide text-[10px] flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                              Blocked Hold
                            </span>
                            <span className="font-black text-[#111111]">{block.quantity.toLocaleString()} Boxes</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px]">
                            <div>
                              <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Blocked By</span>
                              <span className="font-medium text-[#111111] mt-0.5 block">
                                {block.blocked_by ? (block.blocked_by === "SAMSHUDIN" ? "Samshudin" : "Salman") : block.requestedBy}
                              </span>
                            </div>
                            
                            <div>
                              <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Status</span>
                              <span className="font-bold text-amber-600 mt-0.5 block">{block.status}</span>
                            </div>
                            
                            <div>
                              <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Block Date</span>
                              <span className="font-medium text-[#111111] mt-0.5 block">
                                {new Date(block.createdAt).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                            </div>
                            
                            <div>
                              <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Expiry</span>
                              <span className="font-medium text-[#111111] mt-0.5 block">
                                {block.expiresAt ? new Date(block.expiresAt).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                }) : "Never"}
                              </span>
                            </div>
                          </div>

                          {block.remarks && (
                            <div className="pt-2 border-t border-[#EAEAEA] text-[11px]">
                              <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Remarks</span>
                              <span className="text-[#111111] italic mt-0.5 block">"{block.remarks}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-[#EAEAEA] mt-6 flex gap-2">
              {isDealer ? (
                <Link
                  href={`/bookings/new?selectProductId=${selectedProduct.productId}`}
                  onClick={() => setSelectedProduct(null)}
                  className="w-full rounded-xl bg-[#F2C202] py-3 text-center text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-xs"
                >
                  Book Stock Hold
                </Link>
              ) : !isReadOnly && (
                <>
                  <button
                    onClick={() => { setAdjustingProduct(selectedProduct); setSelectedProduct(null); }}
                    className="w-full rounded-xl border border-[#EAEAEA] bg-white py-3 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <h3 className="text-sm font-bold text-[#111111]">Adjust Stock — {adjustingProduct.productName}</h3>
              <button onClick={() => setAdjustingProduct(null)} className="text-[#6B6B6B] hover:text-[#111111]">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            <p className="text-xs text-[#6B6B6B] mt-3">
              Current Available Depot Stock: <strong className="text-emerald-600">{adjustingProduct.availableStock} Boxes</strong>
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
                <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Adjustment Offset (Boxes)</label>
                <input
                  type="number"
                  name="quantity"
                  required
                  placeholder="e.g. -10 or +25"
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Discrepancy Reason</label>
                <select
                  name="reason"
                  required
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
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
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <h3 className="text-sm font-bold text-[#111111]">Create Stock Hold Block</h3>
              <button onClick={() => setBlockingProduct(null)} className="text-[#6B6B6B] hover:text-[#111111]">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <p className="text-xs text-[#6B6B6B] mt-3">
              Target Product: <strong className="text-[#111111]">{blockingProduct.productName}</strong>
            </p>
            <p className="text-xs text-[#6B6B6B]">
              Available to Lock: <strong className="text-emerald-600">{blockingProduct.availableStock} Boxes</strong>
            </p>            <form
              action={async (formData) => {
                setButtonState("CREATING");
                try {
                  await createBlockAction(formData);
                  setButtonState("SUCCESS");
                  setBlockingProduct(null);
                } catch (err: any) {
                  alert(err.message || "Failed to create block.");
                } finally {
                  setButtonState("IDLE");
                  setLoading(false);
                }
              }}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="productId" value={blockingProduct.id} />
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Lock Quantity (Boxes)</label>
                  <input
                    type="number"
                    name="quantity"
                    max={blockingProduct.availableStock}
                    required
                    placeholder="e.g. 100"
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Block Type</label>
                  <select
                    name="blockType"
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  >
                    <option value="BLOCKED">BLOCKED (Temporary Hold)</option>
                    <option value="CONFIRMED">CONFIRMED (Final Booking)</option>
                  </select>
                </div>
              </div>

              {/* Showroom Staff Approval Route selection */}
              {session?.role === "SHOWROOM_STAFF" && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Approval Routing Path</label>
                  <select
                    name="approvalRoute"
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  >
                    <option value="DIRECT">Route A: Send to Manager & Admin</option>
                    <option value="INCHARGE">Route B: Send to Showroom In-Charge</option>
                  </select>
                </div>
              )}

              {/* Super Admin & Manager overrides for mapping specific dealer / showroom */}
              {(session?.role === "SUPER_ADMIN" || session?.role === "MANAGER") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Dealer Partner</label>
                    <select
                      name="dealerId"
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                    >
                      <option value="">Select Dealer (Optional)</option>
                      {dealers.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Showroom Origin</label>
                    <select
                      name="showroomId"
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                    >
                      <option value="">Select Showroom (Optional)</option>
                      {showrooms.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Controlled Blocked By Select dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Blocked By</label>
                <select
                  name="blocked_by"
                  required
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                >
                  <option value="">Select person</option>
                  <option value="SAMSHUDIN">Samshudin</option>
                  <option value="SALMAN">Salman</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Hold Duration Limit</label>
                <select
                  name="durationHours"
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                >
                  <option value="24">24 Hours (Immediate)</option>
                  <option value="48">48 Hours (Standard)</option>
                  <option value="72">72 Hours (Extended)</option>
                  <option value="168">7 Days (Project Reservation)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">Dealer / Project remarks</label>
                <textarea
                  name="remarks"
                  placeholder="e.g. Hold for South Central metro plaza dealer tender"
                  rows={2}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setBlockingProduct(null)}
                  disabled={buttonState !== "IDLE"}
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={buttonState !== "IDLE"}
                  className="rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-50 min-w-[120px] text-center"
                >
                  {buttonState === "CHECKING" && "Checking stock..."}
                  {buttonState === "CREATING" && "Creating block..."}
                  {buttonState === "SUCCESS" && "Block created ✓"}
                  {buttonState === "IDLE" && "Create Block"}
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
    AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    LOW_STOCK: "bg-amber-100 text-amber-800 border-amber-200",
    OUT_OF_STOCK: "bg-rose-100 text-rose-800 border-rose-200",
    INCOMING: "bg-indigo-100 text-indigo-800 border-indigo-200",
    BLOCKED: "bg-purple-100 text-purple-800 border-purple-200",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${badgeMap[status] || badgeMap.AVAILABLE}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function InventoryRow({ label, value, highlight }: any) {
  const colors: any = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    indigo: "text-indigo-700",
    rose: "text-rose-700",
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#EAEAEA]">
      <span className="text-[#6B6B6B] font-bold">{label}</span>
      <span className={`font-black ${colors[highlight] || "text-[#111111]"}`}>{value}</span>
    </div>
  );
}
