"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  adjustStockAction,
  createBlockAction,
  createStockItemAction,
  updateStockItemAction,
  deleteStockItemAction,
} from "@/app/actions";
import {
  Search,
  X,
  Lock,
  AlertCircle,
  MoreVertical,
  Plus,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Pencil,
  Trash2,
  Package,
  Image as ImageIcon,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { getProductThumbnailUrl, getProductImageUrl } from "@/lib/s3";
import { ShimmerImage } from "@/components/Skeleton";
import { NImagesManager, mediaPreviewUrl } from "@/components/common/NImagesManager";

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
  sizes?: string[];
  collections?: string[];
  warehouses?: any[];
  session?: {
    role: string;
    dealerId?: string;
    warehouseId?: string;
  };
}

export function InventoryClientTable({
  initialData,
  brands,
  categories,
  productTypes = [],
  sizes = [],
  collections = [],
  warehouses: initialWarehouses = [],
  session,
}: Props) {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState<string | null>(null);

  // Modals for All Stock CRUD
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItem, setDeletingItem] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Form State for Create / Edit
  const [stockForm, setStockForm] = useState({
    name: "",
    sku: "",
    productCode: "",
    brandId: "",
    categoryId: "",
    productTypeId: "",
    size: "",
    finish: "",
    surface: "",
    color: "",
    price: "",
    mrp: "",
    description: "",
    images: [] as string[],
    image_key: "",
    thumbnail_key: "",
    lifestyleImage: "",
    totalStock: 0,
    looseStock: 0,
    minimumStock: 0,
    maximumStock: 0,
    reorderLevel: 0,
    warehouseId: "",
    remarks: "",
  });

  const [warehouses] = useState<any[]>(initialWarehouses);

  const isSuperAdmin = session?.role === "SUPER_ADMIN";
  const canManage = isSuperAdmin || session?.role === "MANAGER";
  const isReadOnly = session?.role === "WEAVER";
  const canBlock =
    isSuperAdmin ||
    session?.role === "MANAGER" ||
    session?.role === "SHOWROOM_INCHARGE" ||
    session?.role === "SHOWROOM_STAFF";
  const canAdjust = isSuperAdmin;

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

    if (!("page" in updates)) {
      params.set("page", "1");
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== currentSearch) {
        updateFilters({ search });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const items = initialData.items || [];
  const total = initialData.total ?? items.length;
  const page = initialData.page ?? currentPage;
  const totalPages = initialData.totalPages ?? Math.max(1, Math.ceil(total / currentLimit));

  const startIndex = total > 0 ? (page - 1) * currentLimit + 1 : 0;
  const endIndex = Math.min(page * currentLimit, total);

  const hasActiveFilters = !!(
    currentSearch ||
    currentBrandId ||
    currentCategoryId ||
    currentStatus ||
    currentSize ||
    currentCollection ||
    currentSort !== "newest"
  );
  const clearFilters = () => {
    setSearch("");
    startTransition(() => {
      router.push(pathname);
    });
  };

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

  // Open Create Modal
  const openCreateModal = () => {
    setStockForm({
      name: "",
      sku: "",
      productCode: "",
      brandId: brands[0]?.value || "",
      categoryId: categories[0]?.value || "",
      productTypeId: productTypes[0]?.value || "",
      size: "",
      finish: "",
      surface: "",
      color: "",
      price: "",
      mrp: "",
      description: "",
      images: [],
      image_key: "",
      thumbnail_key: "",
      lifestyleImage: "",
      totalStock: 100,
      looseStock: 0,
      minimumStock: 10,
      maximumStock: 1000,
      reorderLevel: 20,
      warehouseId: warehouses[0]?.id || "",
      remarks: "",
    });
    setCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (item: any) => {
    setEditingItem(item);
    setStockForm({
      name: item.productName || "",
      sku: item.sku || "",
      productCode: "",
      brandId: brands.find((b) => b.label === item.brandName)?.value || "",
      categoryId: categories.find((c) => c.label === item.categoryName)?.value || "",
      productTypeId: item.productTypeId || "",
      size: item.size || "",
      finish: item.finish || "",
      surface: "",
      color: "",
      price: "",
      mrp: "",
      description: "",
      images: Array.isArray(item.images) ? item.images : [],
      image_key: item.image_key || "",
      thumbnail_key: item.thumbnail_key || "",
      lifestyleImage: item.lifestyleImage || "",
      totalStock: item.totalStock || 0,
      looseStock: 0,
      minimumStock: item.minimumStock || 0,
      maximumStock: 0,
      reorderLevel: item.reorderLevel || 0,
      warehouseId: warehouses.find((w) => w.name === item.warehouseName)?.id || "",
      remarks: "",
    });
    setEditModalOpen(true);
  };

  // Open Delete Modal
  const openDeleteModal = (item: any) => {
    setDeletingItem(item);
    setDeleteReason("");
    setDeleteModalOpen(true);
  };

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockForm.name.trim()) {
      toast.error("Product name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await createStockItemAction({
        name: stockForm.name,
        sku: stockForm.sku || undefined,
        productCode: stockForm.productCode || undefined,
        brandId: stockForm.brandId || undefined,
        categoryId: stockForm.categoryId || undefined,
        productTypeId: stockForm.productTypeId || undefined,
        size: stockForm.size || undefined,
        finish: stockForm.finish || undefined,
        price: stockForm.price ? parseFloat(stockForm.price) : undefined,
        mrp: stockForm.mrp ? parseFloat(stockForm.mrp) : undefined,
        description: stockForm.description || undefined,
        images: stockForm.images,
        image_key: stockForm.image_key || stockForm.images[0] || undefined,
        thumbnail_key: stockForm.thumbnail_key || stockForm.images[0] || undefined,
        lifestyleImage: stockForm.lifestyleImage || undefined,
        totalStock: Number(stockForm.totalStock),
        looseStock: Number(stockForm.looseStock),
        minimumStock: Number(stockForm.minimumStock),
        reorderLevel: Number(stockForm.reorderLevel),
        warehouseId: stockForm.warehouseId || undefined,
        remarks: stockForm.remarks || undefined,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(`Stock item "${stockForm.name}" created successfully!`);
      setCreateModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to create stock item.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || saving) return;

    setSaving(true);
    try {
      const res = await updateStockItemAction(editingItem.id, {
        name: stockForm.name,
        sku: stockForm.sku || undefined,
        brandId: stockForm.brandId || undefined,
        categoryId: stockForm.categoryId || undefined,
        productTypeId: stockForm.productTypeId || undefined,
        size: stockForm.size || undefined,
        finish: stockForm.finish || undefined,
        images: stockForm.images,
        image_key: stockForm.image_key || stockForm.images[0] || undefined,
        thumbnail_key: stockForm.thumbnail_key || stockForm.images[0] || undefined,
        lifestyleImage: stockForm.lifestyleImage || undefined,
        totalStock: Number(stockForm.totalStock),
        looseStock: Number(stockForm.looseStock),
        minimumStock: Number(stockForm.minimumStock),
        reorderLevel: Number(stockForm.reorderLevel),
        warehouseId: stockForm.warehouseId || undefined,
        remarks: stockForm.remarks || undefined,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success("Stock item updated successfully!");
      setEditModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to update stock item.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Submit
  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingItem || saving) return;

    setSaving(true);
    try {
      const res = await deleteStockItemAction(deletingItem.id, deleteReason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(`Stock item "${deletingItem.productName}" deleted.`);
      setDeleteModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to delete stock item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* FILTER & TOP ACTION BAR */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search catalog across all items by SKU, name, brand or size..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>

        {/* Action Button & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2C202] px-4 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-xs active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add Stock Item
            </button>
          )}

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
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>

          <select
            value={currentCategoryId}
            onChange={(e) => updateFilters({ categoryId: e.target.value })}
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
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

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-[#EAEAEA] bg-white p-10 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F7F7F5]">
            <Package className="h-5 w-5 text-[#6B6B6B]" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-[#111111]">No products found.</h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            {hasActiveFilters
              ? "No stock items match the current search and filters."
              : "Stock items will appear here once inventory is imported or added."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-[#EAEAEA] bg-white px-4 text-xs font-bold text-[#111111] hover:bg-[#F7F7F5]"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-4 w-16 text-center">Image</th>
              <th className="px-4 py-4 font-mono">Product SKU</th>
              <th className="px-4 py-4">Product Description</th>
              <th className="px-4 py-4">Brand</th>
              <th className="px-4 py-4">Size</th>
              <th className="px-4 py-4 text-right">Available</th>
              <th className="px-4 py-4 text-right font-mono">Blocked</th>
              <th className="px-4 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {items.map((item) => {
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
                    {item.images && item.images.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold text-[#6B6B6B] bg-[#F7F7F5] border border-[#EAEAEA] px-1.5 py-0.5 rounded-md">
                        <ImageIcon className="h-2.5 w-2.5" /> {item.images.length} images
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-[#6B6B6B]">{item.brandName || "—"}</td>
                  <td className="px-4 py-3.5 text-[#6B6B6B] font-mono">{item.size || "—"}</td>
                  <td className="px-4 py-3.5 text-right font-black text-emerald-600 font-mono">
                    {item.availableStock.toLocaleString("en-IN")} Box
                  </td>
                  <td className="px-4 py-3.5 text-right text-amber-600 font-mono">
                    {item.blockedStock.toLocaleString("en-IN")} Box
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setSelectedProduct(item)}
                        className="rounded-lg border border-[#EAEAEA] bg-white px-2 py-1 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all"
                      >
                        Inspect
                      </button>
                      {canManage && (
                        <button
                          onClick={() => openEditModal(item)}
                          className="rounded-lg border border-[#EAEAEA] bg-white p-1 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all"
                          title="Edit Stock Item & Images"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canBlock && (
                        <button
                          onClick={() => setBlockingProduct(item)}
                          className="rounded-lg border border-blue-500/25 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600 transition-all hover:bg-blue-600 hover:text-white"
                        >
                          Hold
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          onClick={() => openDeleteModal(item)}
                          className="rounded-lg border border-rose-200 bg-white p-1 text-rose-600 hover:bg-rose-50 transition-all"
                          title="Delete Stock Item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="md:hidden space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedProduct(item)}
            className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs space-y-3 relative active:bg-[#F7F7F5] transition-all cursor-pointer"
          >
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
            </div>

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

            <div className="flex items-center justify-between pt-1">
              <StatusBadge status={item.status} />
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {canManage && (
                  <button
                    onClick={() => openEditModal(item)}
                    className="rounded-lg border border-[#EAEAEA] bg-white p-1.5 text-[#6B6B6B]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => openDeleteModal(item)}
                    className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PAGINATION BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs text-xs">
        <div className="text-[#6B6B6B]">
          Showing <strong className="text-[#111111]">{startIndex}</strong>–
          <strong className="text-[#111111]">{endIndex}</strong> of{" "}
          <strong className="text-[#111111]">{total.toLocaleString("en-IN")}</strong> catalog items
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateFilters({ page: 1 })}
              disabled={page <= 1 || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-30"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => updateFilters({ page: page - 1 })}
              disabled={page <= 1 || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-[#111111] px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => updateFilters({ page: page + 1 })}
              disabled={page >= totalPages || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => updateFilters({ page: totalPages })}
              disabled={page >= totalPages || isPending}
              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-30"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
        </>
      )}

      {/* INSPECT DETAIL DRAWER WITH N-IMAGE GALLERY */}
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
                  className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 space-y-6">
                {/* Image Gallery Viewer for N Images */}
                <div className="space-y-2">
                  <ShimmerImage
                    src={getProductImageUrl(selectedProduct)}
                    alt={selectedProduct.productName}
                    wrapperClassName="overflow-hidden rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] h-48 w-full relative"
                  />
                  {selectedProduct.images && selectedProduct.images.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider mb-2">
                        Product Gallery Images ({selectedProduct.images.length})
                      </p>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {selectedProduct.images.map((imgKey: string, idx: number) => (
                          <div
                            key={idx}
                            className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#EAEAEA] bg-white"
                          >
                            <img
                              src={mediaPreviewUrl(imgKey)}
                              alt={`Product angle ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3.5 rounded-xl bg-[#F7F7F5] p-4 border border-[#EAEAEA]">
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Brand</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block">{selectedProduct.brandName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Dimensions</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block font-mono">{selectedProduct.size}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Category</span>
                    <span className="text-xs font-bold text-[#111111] mt-1 block">{selectedProduct.categoryName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[#6B6B6B] uppercase tracking-wider block">Depot</span>
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
                    <InventoryRow label="Reorder Threshold Alert" value={`${selectedProduct.reorderLevel.toLocaleString("en-IN")} Box`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#EAEAEA] mt-6 flex gap-2">
              {canManage && (
                <button
                  onClick={() => {
                    openEditModal(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="w-full rounded-xl bg-[#F2C202] py-3 text-center text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-xs"
                >
                  Edit Stock Item & Gallery
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE STOCK MODAL WITH N-IMAGE GALLERY */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3 mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-[#111111]">
                <Package className="h-4 w-4 text-[#F2C202]" />
                Add New Stock Product & Inventory
              </h2>
              <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Product Identity */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acron Beige Polished Marble"
                  value={stockForm.name}
                  onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    placeholder="TILES-8001"
                    value={stockForm.sku}
                    onChange={(e) => setStockForm({ ...stockForm, sku: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Dimensions / Size
                  </label>
                  <input
                    type="text"
                    placeholder="600x1200 mm"
                    value={stockForm.size}
                    onChange={(e) => setStockForm({ ...stockForm, size: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Brand</label>
                  <select
                    value={stockForm.brandId}
                    onChange={(e) => setStockForm({ ...stockForm, brandId: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  >
                    <option value="">Select Brand...</option>
                    {brands.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Category</label>
                  <select
                    value={stockForm.categoryId}
                    onChange={(e) => setStockForm({ ...stockForm, categoryId: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Product Type</label>
                  <select
                    value={stockForm.productTypeId}
                    onChange={(e) => setStockForm({ ...stockForm, productTypeId: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  >
                    <option value="">Select Type...</option>
                    {productTypes.map((pt) => (
                      <option key={pt.value} value={pt.value}>
                        {pt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stock Balances */}
              <div className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 space-y-3">
                <p className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Initial Stock & Warehouse Setup
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Opening Stock (Boxes) *</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={stockForm.totalStock}
                      onChange={(e) => setStockForm({ ...stockForm, totalStock: Number(e.target.value) })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Reorder Alert Level</label>
                    <input
                      type="number"
                      min={0}
                      value={stockForm.reorderLevel}
                      onChange={(e) => setStockForm({ ...stockForm, reorderLevel: Number(e.target.value) })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Depot Warehouse</label>
                    <select
                      value={stockForm.warehouseId}
                      onChange={(e) => setStockForm({ ...stockForm, warehouseId: e.target.value })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs"
                    >
                      <option value="">Main Central Depot</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* N Images Gallery */}
              <NImagesManager
                images={stockForm.images}
                onChange={(newImgs) =>
                  setStockForm({
                    ...stockForm,
                    images: newImgs,
                    image_key: stockForm.image_key || newImgs[0] || "",
                    thumbnail_key: stockForm.thumbnail_key || newImgs[0] || "",
                  })
                }
                primaryImage={stockForm.image_key}
                onSetPrimary={(url) => setStockForm({ ...stockForm, image_key: url, thumbnail_key: url })}
              />

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all disabled:opacity-50"
                >
                  {saving ? "Creating Item..." : "Create Stock Item"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2.5 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STOCK MODAL WITH N-IMAGE GALLERY */}
      {editModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setEditModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3 mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-[#111111]">
                <Pencil className="h-4 w-4 text-[#F2C202]" />
                Edit Stock Item ({editingItem.productName})
              </h2>
              <button onClick={() => setEditModalOpen(false)} className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={stockForm.name}
                  onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    value={stockForm.sku}
                    onChange={(e) => setStockForm({ ...stockForm, sku: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Dimensions / Size
                  </label>
                  <input
                    type="text"
                    value={stockForm.size}
                    onChange={(e) => setStockForm({ ...stockForm, size: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 space-y-3">
                <p className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Stock Balance & Reorder Alerts
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Total Physical Stock (Boxes) *</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={stockForm.totalStock}
                      onChange={(e) => setStockForm({ ...stockForm, totalStock: Number(e.target.value) })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Reorder Alert Level</label>
                    <input
                      type="number"
                      min={0}
                      value={stockForm.reorderLevel}
                      onChange={(e) => setStockForm({ ...stockForm, reorderLevel: Number(e.target.value) })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#111111]">Depot Warehouse</label>
                    <select
                      value={stockForm.warehouseId}
                      onChange={(e) => setStockForm({ ...stockForm, warehouseId: e.target.value })}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs"
                    >
                      <option value="">Main Central Depot</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* N Images Gallery */}
              <NImagesManager
                images={stockForm.images}
                onChange={(newImgs) =>
                  setStockForm({
                    ...stockForm,
                    images: newImgs,
                    image_key: stockForm.image_key || newImgs[0] || "",
                    thumbnail_key: stockForm.thumbnail_key || newImgs[0] || "",
                  })
                }
                primaryImage={stockForm.image_key}
                onSetPrimary={(url) => setStockForm({ ...stockForm, image_key: url, thumbnail_key: url })}
              />

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Stock Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2.5 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalOpen && deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 text-rose-700 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Delete Stock Item</h3>
                <p className="text-[11px] text-[#6B6B6B]">Super Admin Action</p>
              </div>
            </div>

            <p className="text-xs text-[#111111] mb-4">
              Are you sure you want to delete <strong>{deletingItem.productName}</strong> ({deletingItem.sku || "No SKU"})? This item will be archived and removed from stock listings.
            </p>

            <form onSubmit={handleDeleteSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Deletion Reason (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Discontinued item / duplicate entry"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !deleteReason.trim()}
                  className="flex-1 rounded-lg bg-rose-600 py-2.5 text-xs font-black text-white hover:bg-rose-700 transition-all disabled:opacity-50"
                >
                  {saving ? "Deleting..." : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2.5 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                >
                  Cancel
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
  const badgeMap: Record<string, { bg: string; label: string }> = {
    AVAILABLE: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Available" },
    LOW_STOCK: { bg: "bg-amber-50 text-amber-700 border-amber-200", label: "Low Stock" },
    OUT_OF_STOCK: { bg: "bg-rose-50 text-rose-700 border-rose-200", label: "Out of Stock" },
    INCOMING: { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", label: "Incoming" },
    BLOCKED: { bg: "bg-orange-50 text-orange-700 border-orange-200", label: "Blocked" },
  };

  const badge = badgeMap[status] || { bg: "bg-gray-50 text-gray-700 border-gray-200", label: status };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider ${badge.bg}`}>
      {badge.label}
    </span>
  );
}

function InventoryRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 font-black",
    blue: "text-blue-600 font-bold",
    amber: "text-amber-600 font-bold",
    indigo: "text-indigo-600 font-bold",
    rose: "text-rose-600 font-bold",
  };

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[#6B6B6B] font-medium">{label}</span>
      <span className={highlight ? colorMap[highlight] : "font-mono font-bold text-[#111111]"}>{value}</span>
    </div>
  );
}
