"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Truck,
  X,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  Package,
  Clock,
  Building2,
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";
import { BlockStatusBadge } from "@/components/blocks/BlockStatusBadge";
import { toast } from "@/lib/toast";
import {
  createLogisticsTransitAction,
  createLogisticsShipmentAction,
  updateLogisticsRecordAction,
  deleteLogisticsRecordAction,
  deliverBlockAction,
} from "@/app/actions";

export interface ShipmentRow {
  id: string;
  blockNumber: string | null;
  status: string;
  quantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  createdAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastActivityAt: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporter: string | null;
  expectedDeliveryAt: string | null;
  shippedBy: string | null;
  remarks?: string | null;
  dealer: { id: string; dealerId: string | null; name: string; company: string | null } | null;
  showroom: { id: string; name: string; city: string | null } | null;
  warehouse: { id: string; name: string; code: string } | null;
  product: {
    id: string;
    name: string;
    productNumber: string;
    size: string | null;
    brand: string | null;
  } | null;
}

interface Props {
  mode: "shipments" | "transit";
  result: {
    items: ShipmentRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    counts: Record<string, number>;
  };
  filters: { status: string; search: string; sort: string; page: number; limit: number };
  userRole?: string;
  products?: Array<{ id: string; name: string; sku: string | null; size: string | null }>;
  dealers?: Array<{ id: string; name: string; dealerId: string | null }>;
  warehouses?: Array<{ id: string; name: string; code: string }>;
}

const SHIPMENT_TABS: Array<{ key: string; label: string; countKey: string }> = [
  { key: "", label: "All", countKey: "all" },
  { key: "READY_TO_SHIP", label: "Ready to Ship", countKey: "readyToShip" },
  { key: "SHIPPED", label: "Shipped", countKey: "shipped" },
  { key: "DELIVERED", label: "Delivered", countKey: "delivered" },
  { key: "CANCELLED", label: "Cancelled", countKey: "cancelled" },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function ShipmentsClientList({
  mode,
  result,
  filters,
  userRole = "SUPER_ADMIN",
  products = [],
  dealers = [],
  warehouses = [],
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(filters.search);

  // Modal States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ShipmentRow | null>(null);

  // Form States
  const [saving, setSaving] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [createForm, setCreateForm] = useState({
    productId: "",
    quantity: 1,
    warehouseId: "",
    dealerId: "",
    vehicleNumber: "",
    driverName: "",
    driverPhone: "",
    transporter: "",
    date: "",
    remarks: "",
  });

  const [editForm, setEditForm] = useState({
    vehicleNumber: "",
    driverName: "",
    driverPhone: "",
    transporter: "",
    expectedDeliveryAt: "",
    status: "",
    remarks: "",
  });

  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const canManage = isSuperAdmin || userRole === "MANAGER";

  const pushFilters = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams();
      const merged: Record<string, any> = { ...filters, ...updates };
      if (!("page" in updates)) merged.page = 1;
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === "") continue;
        if (key === "page" && value === 1) continue;
        if (key === "limit" && value === 20) continue;
        if (key === "sort" && value === "newest") continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [filters, pathname, router]
  );

  const searchRef = useRef(filters.search);
  useEffect(() => {
    searchRef.current = filters.search;
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchInput === searchRef.current) return;
    const handle = setTimeout(() => pushFilters({ search: searchInput }), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.limit + 1;
  const rangeEnd = Math.min(result.page * result.limit, result.total);

  const title = mode === "transit" ? "Transit (Incoming Products)" : "Shipments (Delivered Products)";
  const description =
    mode === "transit"
      ? "Track products currently in transit on the road arriving at destination depots."
      : "Track completed product deliveries and historical dispatch records.";
  const searchPlaceholder =
    mode === "transit"
      ? "Search incoming shipment #, dealer, product, vehicle number, driver…"
      : "Search shipment #, block number, dealer, product, vehicle number, driver…";

  // Calculate Metrics
  const totalUnits = result.items.reduce((acc, row) => acc + (mode === "transit" ? row.shippedQuantity || row.quantity : row.deliveredQuantity || row.quantity), 0);
  const activeCount = result.total;

  const openCreateModal = () => {
    setCreateForm({
      productId: products[0]?.id || "",
      quantity: 1,
      warehouseId: warehouses[0]?.id || "",
      dealerId: "",
      vehicleNumber: "",
      driverName: "",
      driverPhone: "",
      transporter: "",
      date: new Date().toISOString().split("T")[0],
      remarks: "",
    });
    setCreateModalOpen(true);
  };

  const openEditModal = (row: ShipmentRow) => {
    setSelectedRow(row);
    setEditForm({
      vehicleNumber: row.vehicleNumber || "",
      driverName: row.driverName || "",
      driverPhone: row.driverPhone || "",
      transporter: row.transporter || "",
      expectedDeliveryAt: row.expectedDeliveryAt ? new Date(row.expectedDeliveryAt).toISOString().split("T")[0] : "",
      status: row.status,
      remarks: row.remarks || "",
    });
    setEditModalOpen(true);
  };

  const openDeleteModal = (row: ShipmentRow) => {
    setSelectedRow(row);
    setDeleteReason("");
    setDeleteModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (mode === "transit") {
        const res = await createLogisticsTransitAction({
          productId: createForm.productId,
          quantity: Number(createForm.quantity),
          warehouseId: createForm.warehouseId || undefined,
          dealerId: createForm.dealerId || undefined,
          vehicleNumber: createForm.vehicleNumber,
          driverName: createForm.driverName,
          driverPhone: createForm.driverPhone,
          transporter: createForm.transporter,
          expectedDeliveryAt: createForm.date || undefined,
          remarks: createForm.remarks,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`Incoming transit record created (${res.data.blockNumber || "Success"})`);
      } else {
        const res = await createLogisticsShipmentAction({
          productId: createForm.productId,
          quantity: Number(createForm.quantity),
          warehouseId: createForm.warehouseId || undefined,
          dealerId: createForm.dealerId || undefined,
          vehicleNumber: createForm.vehicleNumber || undefined,
          driverName: createForm.driverName,
          driverPhone: createForm.driverPhone,
          transporter: createForm.transporter,
          deliveredAt: createForm.date || undefined,
          remarks: createForm.remarks,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`Delivered shipment record created (${res.data.blockNumber || "Success"})`);
      }
      setCreateModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to create record.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow || saving) return;
    setSaving(true);
    try {
      const res = await updateLogisticsRecordAction(selectedRow.id, {
        vehicleNumber: editForm.vehicleNumber,
        driverName: editForm.driverName,
        driverPhone: editForm.driverPhone,
        transporter: editForm.transporter,
        expectedDeliveryAt: editForm.expectedDeliveryAt || undefined,
        status: editForm.status,
        remarks: editForm.remarks,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Logistics record updated successfully.");
      setEditModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to update record.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDelivered = async (row: ShipmentRow) => {
    if (saving) return;
    if (!confirm(`Mark transit ${row.blockNumber || row.id.slice(-8)} as Delivered?`)) return;
    setSaving(true);
    try {
      const res = await deliverBlockAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Transit marked as Delivered!");
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to mark delivered.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow || saving) return;
    setSaving(true);
    try {
      const res = await deleteLogisticsRecordAction(selectedRow.id, deleteReason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Logistics record deleted.");
      setDeleteModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#111111] sm:text-2xl">{title}</h1>
          <p className="text-xs text-[#6B6B6B]">{description}</p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2C202] px-4 py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-xs active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {mode === "transit" ? "New Transit Dispatch" : "New Shipment Record"}
          </button>
        )}
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-[#8A7300]">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                {mode === "transit" ? "Incoming Units" : "Total Delivered Units"}
              </p>
              <p className="text-lg font-black text-[#111111]">{totalUnits.toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                {mode === "transit" ? "Active Transits" : "Completed Shipments"}
              </p>
              <p className="text-lg font-black text-[#111111]">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Operational Status</p>
              <p className="text-xs font-bold text-emerald-700">Live Logistics Tracking</p>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER TABS FOR SHIPMENTS */}
      {mode === "shipments" && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max min-w-full items-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-white p-1 shadow-xs">
            {SHIPMENT_TABS.map((tab) => {
              const active = filters.status === tab.key;
              const count = result.counts[tab.countKey];
              return (
                <button
                  key={tab.key || "all"}
                  type="button"
                  onClick={() => pushFilters({ status: tab.key })}
                  className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition-all ${
                    active ? "bg-[#F2C202] text-white shadow-xs" : "text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
                  }`}
                >
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                        active ? "bg-white/25 text-white" : "bg-[#F7F7F5] text-[#6B6B6B]"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="flex items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white p-3 shadow-xs">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] px-3 focus-within:border-[#F2C202] focus-within:bg-white">
          <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${title.toLowerCase()}`}
            className="min-h-[44px] w-full bg-transparent text-xs font-medium outline-hidden placeholder:text-[#9A9A9A]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="shrink-0 rounded-md p-1 text-[#6B6B6B] hover:text-[#111111]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* TABLE / CARDS VIEW */}
      {isPending ? (
        <ShipmentsSkeleton rows={Math.min(result.limit, 6)} />
      ) : result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#EAEAEA] bg-white p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-[#EAEAEA]" />
          <p className="mt-3 text-sm font-bold text-[#111111]">
            {mode === "transit" ? "Nothing currently in transit." : "No shipments match this view."}
          </p>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            {filters.search || filters.status
              ? "Try clearing search or filters."
              : mode === "transit"
                ? "Dispatched items will appear here until they are delivered."
                : "Deliveries will appear here as they are processed."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                  <tr>
                    <th className="px-4 py-3.5">Tracking #</th>
                    <th className="px-4 py-3.5">Product</th>
                    <th className="px-4 py-3.5">Dealer / Destination</th>
                    <th className="px-4 py-3.5 text-right">Qty</th>
                    <th className="px-4 py-3.5">From → Destination</th>
                    <th className="px-4 py-3.5">Vehicle</th>
                    <th className="px-4 py-3.5">Driver</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">{mode === "transit" ? "Expected" : "Last Update"}</th>
                    <th className="px-4 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA] text-[#111111]">
                  {result.items.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[#F7F7F5]/60">
                      <td className="px-4 py-3.5 align-top">
                        <Link
                          href={`/blocks/${s.id}`}
                          className="font-mono text-[10.5px] font-bold text-[#111111] underline-offset-2 hover:underline"
                        >
                          {s.blockNumber || s.id.slice(-8).toUpperCase()}
                        </Link>
                        <p className="mt-0.5 text-[10px] text-[#6B6B6B]">{formatDate(s.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-bold">{s.product?.name || "Unknown product"}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
                          {s.product?.productNumber || "—"}
                          {s.product?.size ? ` · ${s.product.size}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-bold">{s.dealer?.name || "Internal Hold"}</p>
                        {s.dealer?.dealerId && <p className="font-mono text-[10px] text-[#6B6B6B]">{s.dealer.dealerId}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top font-mono font-black text-[#8A7300]">
                        {mode === "transit" ? s.shippedQuantity || s.quantity : s.deliveredQuantity || s.quantity}
                      </td>
                      <td className="px-4 py-3.5 align-top text-[11px]">
                        <p>{s.warehouse?.name || "Depot"}</p>
                        <p className="font-bold text-[#111111]">
                          → {s.dealer?.name || s.showroom?.name || "Customer"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        {s.vehicleNumber ? (
                          <span className="rounded-md bg-[#F7F7F5] px-2 py-1 font-mono text-[10.5px] font-bold text-[#111111]">
                            {s.vehicleNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#9A9A9A]">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top text-[11px]">
                        <p>{s.driverName || "—"}</p>
                        {s.driverPhone && <p className="text-[10px] text-[#6B6B6B]">{s.driverPhone}</p>}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <BlockStatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3.5 align-top whitespace-nowrap text-[10px] text-[#6B6B6B]">
                        {mode === "transit" ? formatDate(s.expectedDeliveryAt || s.shippedAt) : formatDate(s.lastActivityAt)}
                      </td>
                      <td className="px-4 py-3.5 text-center align-top">
                        <div className="flex items-center justify-center gap-1.5">
                          {mode === "transit" && (s.status === "SHIPPED" || s.status === "PARTIALLY_SHIPPED") && canManage && (
                            <button
                              onClick={() => handleMarkDelivered(s)}
                              disabled={saving}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Mark Delivered"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => openEditModal(s)}
                              className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all"
                              title="Edit Record"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button
                              onClick={() => openDeleteModal(s)}
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 transition-all"
                              title="Delete Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <Link
                            href={`/blocks/${s.id}`}
                            className="inline-flex min-h-[28px] items-center rounded-lg border border-[#EAEAEA] px-2 text-[10px] font-black text-[#6B6B6B] hover:bg-[#F7F7F5]"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {result.items.map((s) => (
              <div
                key={s.id}
                className="space-y-2.5 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-black text-[#111111]">
                      {s.blockNumber || s.id.slice(-8).toUpperCase()}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-bold text-[#111111]">
                      {s.product?.name || "Unknown product"}
                    </p>
                  </div>
                  <BlockStatusBadge status={s.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6B6B6B]">
                  <p>
                    Dealer: <strong className="text-[#111111]">{s.dealer?.name || "Internal Hold"}</strong>
                  </p>
                  <p>
                    Qty: <strong className="text-[#111111]">{s.quantity}</strong>
                  </p>
                  <p className="col-span-2">
                    Vehicle: <strong className="font-mono text-[#111111]">{s.vehicleNumber || "Not set"}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#EAEAEA]">
                  {mode === "transit" && (s.status === "SHIPPED" || s.status === "PARTIALLY_SHIPPED") && canManage && (
                    <button
                      onClick={() => handleMarkDelivered(s)}
                      disabled={saving}
                      className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-xs font-bold text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "Updating..." : "Mark Delivered"}
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => openEditModal(s)}
                      className="rounded-xl border border-[#EAEAEA] p-2 text-[#6B6B6B] hover:bg-[#F7F7F5]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      onClick={() => openDeleteModal(s)}
                      className="rounded-xl border border-rose-200 p-2 text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <Link
                    href={`/blocks/${s.id}`}
                    className="flex-1 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] py-2 text-center text-xs font-bold text-[#111111]"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* PAGINATION */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[#EAEAEA] bg-white p-3 text-xs shadow-xs sm:flex-row">
            <p className="text-[11px] text-[#6B6B6B]">
              Showing <strong className="text-[#111111]">{rangeStart}</strong>–
              <strong className="text-[#111111]">{rangeEnd}</strong> of{" "}
              <strong className="text-[#111111]">{result.total}</strong> items
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={result.page <= 1}
                onClick={() => pushFilters({ page: result.page - 1 })}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#EAEAEA] px-3 text-[11px] font-bold text-[#6B6B6B] disabled:opacity-40 hover:bg-[#F7F7F5]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="text-[11px] font-bold text-[#111111]">
                {result.page} / {result.totalPages}
              </span>
              <button
                type="button"
                disabled={result.page >= result.totalPages}
                onClick={() => pushFilters({ page: result.page + 1 })}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#EAEAEA] px-3 text-[11px] font-bold text-[#6B6B6B] disabled:opacity-40 hover:bg-[#F7F7F5]"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3 mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-[#111111]">
                <Truck className="h-4 w-4 text-[#F2C202]" />
                {mode === "transit" ? "Create Incoming Transit" : "Record Delivered Shipment"}
              </h2>
              <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Product *
                </label>
                <select
                  required
                  value={createForm.productId}
                  onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold focus:border-[#F2C202] focus:outline-hidden"
                >
                  <option value="">Select Product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""} {p.size ? `· ${p.size}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Quantity (Boxes / Units) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={createForm.quantity}
                    onChange={(e) => setCreateForm({ ...createForm, quantity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono font-bold focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Origin Depot / Warehouse
                  </label>
                  <select
                    value={createForm.warehouseId}
                    onChange={(e) => setCreateForm({ ...createForm, warehouseId: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  >
                    <option value="">Default Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Destination Dealer / Customer
                </label>
                <select
                  value={createForm.dealerId}
                  onChange={(e) => setCreateForm({ ...createForm, dealerId: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                >
                  <option value="">Internal Stock Hold / Direct Customer</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.dealerId ? `(${d.dealerId})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Vehicle Number {mode === "transit" && "*"}
                  </label>
                  <input
                    type="text"
                    required={mode === "transit"}
                    placeholder="KA-04-AB-1234"
                    value={createForm.vehicleNumber}
                    onChange={(e) => setCreateForm({ ...createForm, vehicleNumber: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono uppercase focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Transporter Company
                  </label>
                  <input
                    type="text"
                    placeholder="VRL Logistics"
                    value={createForm.transporter}
                    onChange={(e) => setCreateForm({ ...createForm, transporter: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    placeholder="Ramesh Kumar"
                    value={createForm.driverName}
                    onChange={(e) => setCreateForm({ ...createForm, driverName: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Driver Phone
                  </label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={createForm.driverPhone}
                    onChange={(e) => setCreateForm({ ...createForm, driverPhone: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  {mode === "transit" ? "Expected Arrival Date" : "Delivery Date"}
                </label>
                <input
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={createForm.remarks}
                  onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all disabled:opacity-50"
                >
                  {saving ? "Processing..." : mode === "transit" ? "Create Transit Record" : "Save Shipment Record"}
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

      {/* EDIT MODAL */}
      {editModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setEditModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3 mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-[#111111]">
                <Pencil className="h-4 w-4 text-[#F2C202]" />
                Edit Logistics Record ({selectedRow.blockNumber || selectedRow.id.slice(-8)})
              </h2>
              <button onClick={() => setEditModalOpen(false)} className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={editForm.vehicleNumber}
                    onChange={(e) => setEditForm({ ...editForm, vehicleNumber: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono uppercase focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold focus:border-[#F2C202] focus:outline-hidden"
                  >
                    <option value="SHIPPED">SHIPPED</option>
                    <option value="PARTIALLY_SHIPPED">PARTIALLY_SHIPPED</option>
                    <option value="DELIVERED">DELIVERED</option>
                    <option value="PARTIALLY_DELIVERED">PARTIALLY_DELIVERED</option>
                    <option value="READY_TO_SHIP">READY_TO_SHIP</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={editForm.driverName}
                    onChange={(e) => setEditForm({ ...editForm, driverName: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Driver Phone
                  </label>
                  <input
                    type="text"
                    value={editForm.driverPhone}
                    onChange={(e) => setEditForm({ ...editForm, driverPhone: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Transporter
                  </label>
                  <input
                    type="text"
                    value={editForm.transporter}
                    onChange={(e) => setEditForm({ ...editForm, transporter: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Expected Arrival Date
                  </label>
                  <input
                    type="date"
                    value={editForm.expectedDeliveryAt}
                    onChange={(e) => setEditForm({ ...editForm, expectedDeliveryAt: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Changes"}
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
      {deleteModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 text-rose-700 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Delete Logistics Record</h3>
                <p className="text-[11px] text-[#6B6B6B]">Super Admin Action</p>
              </div>
            </div>

            <p className="text-xs text-[#111111] mb-4">
              Are you sure you want to delete record <strong>{selectedRow.blockNumber || selectedRow.id}</strong>? If this item is currently in transit, its stock will be rolled back to available inventory.
            </p>

            <form onSubmit={handleDeleteSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Deletion Reason (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Order cancelled by client / entry error"
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

function ShipmentsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-[#EAEAEA] bg-white" />
      ))}
    </div>
  );
}
