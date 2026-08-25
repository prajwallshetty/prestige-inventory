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
import { toast } from "sonner";

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

  // Debounced search + immediate filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ page: 1 }), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, brandId, showArchived]);

  const handleDeactivate = async (id: string, currentlyArchived: boolean) => {
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
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This is reversible only by a database admin.`)) return;
    try {
      const res = await fetch(`/api/v1/products/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Product deleted");
      load({ page });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider mb-1">
            <Package className="w-4 h-4" /> Catalog Management
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Product Catalog</h1>
          <p className="text-slate-400 text-sm mt-1">
            {data.total} product{data.total === 1 ? "" : "s"} · create, edit, search, and retire tile products.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-600/25"
        >
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by name, SKU, product number, size, finish, surface..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Brands</option>
          {options.brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-400 px-3 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-indigo-600"
          />
          Include deleted
        </label>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="p-4 font-semibold">Product</th>
                <th className="p-4 font-semibold">Brand / Category</th>
                <th className="p-4 font-semibold">Size / Finish</th>
                <th className="p-4 font-semibold">Stock</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">Loading…</td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">
                    No products found. Try clearing filters or add a new product.
                  </td>
                </tr>
              ) : (
                data.items.map((p) => {
                  const thumb = thumbnailUrl(p);
                  const isArchived = p.status === "ARCHIVED" || !p.published;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                            {thumb ? (
                              <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageOff className="w-4 h-4 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-semibold truncate max-w-[220px]">{p.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {p.sku || p.productCode || "No SKU"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-300 text-xs">
                        <p>{p.brand?.name || "—"}</p>
                        <p className="text-slate-500">{p.category?.name || "—"}</p>
                      </td>
                      <td className="p-4 text-slate-300 text-xs">
                        <p>{p.size || "—"}</p>
                        <p className="text-slate-500">{[p.finish, p.surface].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className="p-4 text-xs">
                        <span className="text-white font-medium">{p.inventory?.availableStock ?? 0}</span>
                        <span className="text-slate-500"> / {p.inventory?.totalStock ?? 0}</span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isArchived
                              ? "bg-slate-800 text-slate-400 border-slate-700"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {isArchived ? "ARCHIVED" : "ACTIVE"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/products/${p.id}/edit`}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleDeactivate(p.id, isArchived)}
                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                            title={isArchived ? "Reactivate" : "Deactivate"}
                          >
                            {isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(p.id, p.name)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
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
          <div className="flex items-center justify-between p-4 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => load({ page: page - 1 })}
                className="p-2 rounded-lg border border-slate-800 disabled:opacity-30 hover:bg-slate-800 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= data.totalPages}
                onClick={() => load({ page: page + 1 })}
                className="p-2 rounded-lg border border-slate-800 disabled:opacity-30 hover:bg-slate-800 transition"
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
