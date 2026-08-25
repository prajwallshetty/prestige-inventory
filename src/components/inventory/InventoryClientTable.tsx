"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { isOffline, OFFLINE_MESSAGE } from "@/lib/offline";
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
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw
} from "lucide-react";
import Link from "next/link";
import { getProductThumbnailUrl, getProductImageUrl } from "@/lib/s3";
import { ShimmerImage } from "@/components/Skeleton";

interface Props {
  initialData: {
    items: any[];
    total?: number;
    page?: number;
    totalPages?: number;
    limit?: number;
  };
  brands: any[];
  categories: any[];
  productTypes?: any[];
  /** Distinct values that actually exist in the catalogue (spec §21). */
  sizes?: string[];
  collections?: string[];
  session?: {
    role: string;
    dealerId?: string;
    warehouseId?: string;
  };
}

export function InventoryClientTable({ initialData, brands, categories, productTypes = [], sizes = [], collections = [], session }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") || "";
  const currentBrandId = searchParams.get("brandId") || "";
  const currentCategoryId = searchParams.get("categoryId") || "";
  const currentProductTypeId = searchParams.get("productTypeId") || "";
  const currentStatus = searchParams.get("status") || "";
  const currentSize = searchParams.get("size") || "";
  const currentCollection = searchParams.get("collection") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentLimit = parseInt(searchParams.get("limit") || "20");

  const [search, setSearch] = useState(currentSearch);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any>(null);
  const [blockingProduct, setBlockingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<string | null>(null);
  const [dealers, setDealers] = useState<any[]>([]);
  const [showrooms, setShowrooms] = useState<any[]>([]);
  const [buttonState, setButtonState] = useState<"IDLE" | "CHECKING" | "CREATING" | "SUCCESS">("IDLE");

  // Keep search input synced when URL parameters change
  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  const updateFilters = (updates: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1 unless page itself is explicitly specified
    if (!("page" in updates)) {
      params.set("page", "1");
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Debounced search sync to URL (queries full database server-side)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== currentSearch) {
        updateFilters({ search });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    if (session?.role === "SUPER_ADMIN" || session?.role === "MANAGER") {
      getDealersAndWarehousesAction().then(({ dealers, showrooms }) => {
        setDealers(dealers || []);
        setShowrooms(showrooms || []);
      });
    }
  }, [session]);

  // The DEALER login role was retired in Phase 1; WEAVER is the read-only role.
  const isDealer = false;
  const isReadOnly = session?.role === "WEAVER";
  // Only these roles may raise a block, and only a Super Admin may adjust
  // physical stock — the same rules the server enforces.
  const canBlock =
    session?.role === "SUPER_ADMIN" ||
    session?.role === "MANAGER" ||
    session?.role === "SHOWROOM_INCHARGE" ||
    session?.role === "SHOWROOM_STAFF";
  const canAdjust = session?.role === "SUPER_ADMIN";

  const items = initialData.items || [];
  const total = initialData.total ?? items.length;
  const page = initialData.page ?? currentPage;
  const totalPages = initialData.totalPages ?? Math.max(1, Math.ceil(total / currentLimit));
  
  const startIndex = total > 0 ? (page - 1) * currentLimit + 1 : 0;
  const endIndex = Math.min(page * currentLimit, total);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        end = 4;
      } else if (page >= totalPages - 2) {
        start = totalPages - 3;
      }

      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

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
            placeholder="Search catalog across all 1,100+ items by SKU, name or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {productTypes && productTypes.length > 0 && (
            <select
              value={currentProductTypeId}
              onChange={(e) => updateFilters({ productTypeId: e.target.value })}
              className="rounded-lg border border-[#F2C202]/40 bg-[#F7F7F5] p-2 text-xs text-[#111111] font-semibold focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
            >
              <option value="">All Product Types</option>
              {productTypes.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label} ({pt.count})
                </option>
              ))}
            </select>
          )}

          <select
            value={currentBrandId}
            onChange={(e) => updateFilters({ brandId: e.target.value })}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            value={currentCategoryId}
            onChange={(e) => updateFilters({ categoryId: e.target.value })}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={currentStatus}
            onChange={(e) => updateFilters({ status: e.target.value })}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
            <option value="INCOMING">Incoming</option>
            <option value="BLOCKED">Blocked</option>
          </select>

          <select
            value={currentSize}
            onChange={(e) => updateFilters({ size: e.target.value })}
            aria-label="Filter by size"
            className="min-h-[40px] rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Sizes</option>
            {sizes.map((sz) => (
              <option key={sz} value={sz}>{sz}</option>
            ))}
          </select>

          <select
            value={currentCollection}
            onChange={(e) => updateFilters({ collection: e.target.value })}
            aria-label="Filter by collection"
            className="min-h-[40px] rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Collections</option>
            {collections.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={currentSort}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            aria-label="Sort products"
            className="min-h-[40px] rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="stock_desc">Most available</option>
            <option value="stock_asc">Least available</option>
          </select>

          {(currentSearch || currentBrandId || currentCategoryId || currentStatus || currentSize || currentCollection || currentSort !== "newest") && (
            <button
              onClick={() => {
                setSearch("");
                startTransition(() => {
                  router.push(pathname);
                });
              }}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          )}
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
              <th className="px-4 py-4 text-center">Blocked By</th>
              <th className="px-4 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {items.map((item) => {
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
                  <td className="px-4 py-3.5 font-bold font-mono text-[#111111]">{item.sku || "—"}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setSelectedProduct(item)}
                      className="text-[#8A7300] hover:text-[#D8AD02] hover:underline font-bold text-left transition-colors cursor-pointer"
                    >
                      {item.productName}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-[#6B6B6B]">{item.brandName || "—"}</td>
                  <td className="px-4 py-3.5 text-[#6B6B6B] font-mono">{item.size || "—"}</td>
                  <td className="px-4 py-3.5 text-right font-black text-emerald-600 font-mono">{item.availableStock.toLocaleString("en-IN")} Box</td>
                  <td className="px-4 py-3.5 text-right text-amber-600 font-mono">{item.blockedStock.toLocaleString("en-IN")} Box</td>
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
                            onClick={() => setSelectedProduct(item)}
                            className="rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                          >
                            Inspect
                          </button>
                          {canAdjust && (
                            <button
                              onClick={() => setAdjustingProduct(item)}
                              className="rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                            >
                              Adjust
                            </button>
                          )}
                          {canBlock && (
                            <button
                              onClick={() => setBlockingProduct(item)}
                              disabled={item.availableStock <= 0}
                              title={item.availableStock <= 0 ? "No stock available to block" : undefined}
                              className="rounded-lg border border-blue-500/25 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-600 transition-all touch-target hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-50 disabled:hover:text-blue-600"
                            >
                              Block
                            </button>
                          )}
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
        {items.map((item) => {
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
                  <p className="text-[10px] text-[#6B6B6B] mt-0.5">{item.brandName || "—"}</p>
                  <p className="text-[10px] text-[#6B6B6B] font-mono">{item.size || "—"}</p>
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
                      {canAdjust && (
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
              <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#EAEAEA] text-center bg-[#F7F7F5] rounded-lg">
                <div>
                  <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Available</p>
                  <p className="text-xs font-black text-emerald-600 mt-0.5">{item.availableStock} Box</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Blocked</p>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">{item.blockedStock} Box</p>
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

      {/* EMPTY STATE */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-[#EAEAEA] bg-white rounded-xl space-y-3">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <h3 className="text-sm font-bold text-[#111111]">No Stock Items Found</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm">
            No products matched your current search or filter criteria. Try resetting filters or searching with a different term.
          </p>
          <button
            onClick={() => {
              setSearch("");
              startTransition(() => {
                router.push(pathname);
              });
            }}
            className="mt-2 rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-bold text-white hover:bg-[#D8AD02] cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* PAGINATION & STATS BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm text-xs">
        <div className="flex flex-wrap items-center gap-3 text-[#6B6B6B]">
          <span>
            Showing <strong className="text-[#111111]">{startIndex}</strong> to <strong className="text-[#111111]">{endIndex}</strong> of <strong className="text-[#111111]">{total.toLocaleString("en-IN")}</strong> catalog items
          </span>
          <div className="hidden sm:block h-4 w-px bg-[#EAEAEA]" />
          <div className="flex items-center gap-2">
            <span>Per page:</span>
            <select
              value={currentLimit}
              onChange={(e) => updateFilters({ limit: Number(e.target.value) })}
              className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-2 py-1 text-xs font-bold text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
              <option value="1200">All ({total})</option>
            </select>
          </div>
        </div>

        {/* Page Nav Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateFilters({ page: 1 })}
              disabled={page <= 1 || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => updateFilters({ page: page - 1 })}
              disabled={page <= 1 || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 px-1">
              {getPageNumbers().map((p, idx) =>
                typeof p === "number" ? (
                  <button
                    key={idx}
                    onClick={() => updateFilters({ page: p })}
                    disabled={isPending}
                    className={`min-w-[32px] h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      p === page
                        ? "bg-[#F2C202] text-white font-black shadow-xs"
                        : "border border-[#EAEAEA] bg-white text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
                    }`}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={idx} className="px-1 text-[#6B6B6B]/40 font-mono">
                    {p}
                  </span>
                )
              )}
            </div>

            <button
              onClick={() => updateFilters({ page: page + 1 })}
              disabled={page >= totalPages || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => updateFilters({ page: totalPages })}
              disabled={page >= totalPages || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}
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
                    <InventoryRow label="Physical Available Stock" value={`${selectedProduct.availableStock.toLocaleString("en-IN")} Box`} highlight="emerald" />
                    <InventoryRow label="Allocated (Ready for Shipment)" value={`${selectedProduct.allocatedStock.toLocaleString("en-IN")} Box`} highlight="blue" />
                    <InventoryRow label="Temporary Block Holds" value={`${selectedProduct.blockedStock.toLocaleString("en-IN")} Box`} highlight="amber" />
                    <InventoryRow label="In-Transit Deliveries" value={`${selectedProduct.transitStock.toLocaleString("en-IN")} Box`} highlight="indigo" />
                    <InventoryRow label="Damaged / Write-Offs" value={`${selectedProduct.damagedStock.toLocaleString("en-IN")} Box`} highlight="rose" />
                    <InventoryRow label="Reorder Threshold Alert" value={`${selectedProduct.reorderLevel.toLocaleString("en-IN")} Box`} />
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
                            <span className="font-black text-[#111111]">{block.quantity.toLocaleString("en-IN")} Boxes</span>
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
              ) : (canAdjust || canBlock) && (
                <>
                  {canAdjust && (
                  <button
                    onClick={() => { setAdjustingProduct(selectedProduct); setSelectedProduct(null); }}
                    className="w-full rounded-xl border border-[#EAEAEA] bg-white py-3 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
                  >
                    Adjust Stock
                  </button>
                  )}
                  {canBlock && (
                    <button
                      onClick={() => { setBlockingProduct(selectedProduct); setSelectedProduct(null); }}
                      disabled={selectedProduct.availableStock <= 0}
                      className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {selectedProduct.availableStock > 0 ? "Create Hold" : "No stock available"}
                    </button>
                  )}
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
                if (isOffline()) {
                  toast.error(OFFLINE_MESSAGE);
                  return;
                }
                setLoading(true);
                try {
                  const result = await adjustStockAction(formData);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Stock adjusted.");
                  setAdjustingProduct(null);
                  startTransition(() => router.refresh());
                } catch {
                  toast.error("Connection failed. Please try again.");
                } finally {
                  setLoading(false);
                }
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
                if (isOffline()) {
                  toast.error(OFFLINE_MESSAGE);
                  return;
                }
                setButtonState("CREATING");
                try {
                  const result = await createBlockAction(formData);
                  if (!result.ok) {
                    // The modal stays open so the quantity can be corrected
                    // against the message rather than retyped from scratch.
                    toast.error(result.error);
                    return;
                  }
                  setButtonState("SUCCESS");
                  toast.success(`Block ${result.data.blockNumber} created.`);
                  setBlockingProduct(null);
                  startTransition(() => router.refresh());
                } catch {
                  toast.error("Connection failed. Please try again.");
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
