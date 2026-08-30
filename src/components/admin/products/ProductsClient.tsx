"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Archive,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ImageOff,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  productCode: string | null;
  size: string | null;
  finish: string | null;
  surface: string | null;
  color: string | null;
  status: string;
  published: boolean;
  image_key: string | null;
  thumbnail_key: string | null;
  lifestyleImage: string | null;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  collectionRelation: { id: string; name: string } | null;
  inventory: { totalStock: number; availableStock: number; stockStatus: string } | null;
}

interface ListData {
  items: ProductListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  initialData: ListData;
  options: { brands: Option[]; categories: Option[]; collections: Option[]; productTypes: Option[]; units: any[] };
}

function thumbnailUrl(p: ProductListItem): string | null {
  const key = p.thumbnail_key || p.image_key || p.lifestyleImage;
  if (!key) return null;
  if (key.startsWith("http")) return key;
  const base =
    process.env.NEXT_PUBLIC_S3_BUCKET_URL || "https://your-prestige-in.s3.ap-south-1.amazonaws.com";
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

export function ProductsClient({ initialData, options }: Props) {
  const [data, setData] = useState<ListData>(initialData);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);

  const load = useCallback(
    async (opts: { page?: number } = {}) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (categoryId) params.set("categoryId", categoryId);
        if (brandId) params.set("brandId", brandId);
        if (showArchived) params.set("includeDeleted", "true");
        params.set("page", String(opts.page || page));
        params.set("limit", "24");

        const res = await fetch(`/api/v1/products?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load products");
        setData(json);
        setPage(json.page);
      } catch (err: any) {
        toast.error(err.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    [search, categoryId, brandId, showArchived, page]
  );

  // Debounced search + immediate filter changes. Skipped on the very first
  // run — the server already fetched `initialData` for the default filters,
  // so refiring here would duplicate that request on every page load.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ page: 1 }), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, brandId, showArchived]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDeactivate = async (id: string, currentlyArchived: boolean) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/products/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: currentlyArchived ? "reactivate" : "deactivate" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(currentlyArchived ? "Product reactivated" : "Product deactivated");
      load({ page });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (busyId) return;
    if (!confirm(`Delete "${name}"? This is reversible only by a database admin.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/products/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Product deleted");
      load({ page });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-[#EAEAEA] p-6 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-[#F2C202] font-black text-xs uppercase tracking-wider mb-1">
            <Package className="w-4 h-4" /> Catalog Management
          </div>
          <h1 className="text-xl font-black text-[#111111] tracking-tight">Product Catalog</h1>
          <p className="text-[#6B6B6B] text-xs mt-1">
            {data.total} product{data.total === 1 ? "" : "s"} · create, edit, search, and retire tile products.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F2C202] hover:bg-[#D8AD02] text-white font-black text-xs rounded-xl transition shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by name, SKU, product number, size, finish, surface..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl pl-9 pr-3 py-2 text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-hidden focus:border-[#F2C202] transition"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="bg-white border border-[#EAEAEA] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
        >
          <option value="">All Categories</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="bg-white border border-[#EAEAEA] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
        >
          <option value="">All Brands</option>
          {options.brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-medium text-[#6B6B6B] px-3 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-[#F2C202]"
          />
          Include deleted
        </label>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              <tr>
                <th className="p-4 w-16 text-center">Image</th>
                <th className="p-4">Brand</th>
                <th className="p-4">Product</th>
                <th className="p-4">Surface</th>
                <th className="p-4">Size</th>
                <th className="p-4 text-right font-mono">Stock</th>
                <th className="p-4 text-right font-mono">Blocked</th>
                <th className="p-4 text-right font-mono">Available</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#6B6B6B] text-xs">Loading catalogue...</td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#6B6B6B] text-xs">
                    Product catalog is empty. Upload a new catalog to view products.
                  </td>
                </tr>
              ) : (
                data.items.map((p) => {
                  const thumb = thumbnailUrl(p);
                  const isArchived = p.status === "ARCHIVED" || !p.published;
                  const surface = p.surface || p.finish || "—";
                  const totalStock = p.inventory?.totalStock ?? 0;
                  const availableStock = p.inventory?.availableStock ?? 0;
                  const blockedStock = Math.max(0, totalStock - availableStock);

                  return (
                    <tr key={p.id} className="hover:bg-[#F7F7F5]/50 transition">
                      <td className="p-2">
                        <div className="w-10 h-10 rounded-lg bg-[#F7F7F5] border border-[#EAEAEA] flex items-center justify-center overflow-hidden shrink-0 mx-auto">
                          {thumb ? (
                            <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageOff className="w-4 h-4 text-[#6B6B6B]" />
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-bold text-[#111111]">{p.brand?.name || "—"}</td>
                      <td className="p-4">
                        <p className="text-[#111111] font-black">{p.name}</p>
                      </td>
                      <td className="p-4 text-[#6B6B6B] font-semibold">{surface}</td>
                      <td className="p-4 font-mono text-[#6B6B6B]">{p.size || "—"}</td>
                      <td className="p-4 text-right font-mono font-bold text-[#111111]">{totalStock}</td>
                      <td className="p-4 text-right font-mono text-amber-600 font-bold">{blockedStock}</td>
                      <td className="p-4 text-right font-mono text-emerald-600 font-black">{availableStock}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider border ${
                            isArchived
                              ? "bg-gray-100 text-gray-600 border-gray-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {isArchived ? "ARCHIVED" : "ACTIVE"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/products/${p.id}/edit`}
                            className="p-1.5 text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F7F7F5] rounded-lg transition border border-[#EAEAEA]"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleDeactivate(p.id, isArchived)}
                            disabled={busyId === p.id}
                            className="p-1.5 text-[#6B6B6B] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition border border-[#EAEAEA] disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isArchived ? "Reactivate" : "Deactivate"}
                          >
                            {isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(p.id, p.name)}
                            disabled={busyId === p.id}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition border border-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-[#EAEAEA] text-xs text-[#6B6B6B]">
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => load({ page: page - 1 })}
                className="p-1.5 rounded-lg border border-[#EAEAEA] disabled:opacity-30 hover:bg-[#F7F7F5] transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= data.totalPages}
                onClick={() => load({ page: page + 1 })}
                className="p-1.5 rounded-lg border border-[#EAEAEA] disabled:opacity-30 hover:bg-[#F7F7F5] transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
