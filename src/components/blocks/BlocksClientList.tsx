"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { isOffline, OFFLINE_MESSAGE } from "@/lib/offline";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Package,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";

import {
  approveBlockAction,
  cancelBlockAction,
  deliverBlockAction,
  markReadyToShipAction,
  rejectBlockAction,
  releaseBlockAction,
  shipBlockAction,
} from "@/app/actions";
import {
  canApproveBlock,
  canCancelBlock,
  canDeliverBlock,
  canMarkReadyToShip,
  canRejectBlock,
  canReleaseBlock,
  canShipBlock,
  type BlockStatus,
  type Role,
} from "@/lib/permissions";
import { BlockStatusBadge, ExpiryBadge } from "@/components/blocks/BlockStatusBadge";

type ActionType = "APPROVE" | "REJECT" | "SHIP" | "DELIVER" | "RELEASE" | "CANCEL";

interface BlockRow {
  id: string;
  blockNumber: string | null;
  status: string;
  quantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  requestedBy: string;
  createdById: string | null;
  createdRole: string | null;
  approvalRoute: string;
  remarks: string | null;
  blockedBy: string | null;
  showroomId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  lastActivityAt: string | null;
  dealer: { id: string; dealerId: string | null; name: string; company: string | null } | null;
  showroom: { id: string; name: string; city: string | null } | null;
  warehouse: { id: string; name: string; code: string } | null;
  product: {
    id: string;
    name: string;
    productNumber: string;
    size: string | null;
    brand: string | null;
    thumbnailKey: string | null;
  } | null;
}

interface Props {
  result: {
    items: BlockRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    counts: Record<string, number>;
  };
  filters: {
    status: string;
    search: string;
    dealerId: string;
    showroomId: string;
    from: string;
    to: string;
    sort: string;
    page: number;
    limit: number;
  };
  dealers: Array<{ id: string; name: string; dealerId: string | null }>;
  showrooms: Array<{ id: string; name: string }>;
  session: { role: Role; userId: string | null; showroomId: string | null; name: string };
}

const TABS: Array<{ key: string; label: string; countKey: string }> = [
  { key: "", label: "All", countKey: "all" },
  { key: "PENDING", label: "Pending approval", countKey: "pending" },
  { key: "READY_TO_SHIP", label: "Ready to ship", countKey: "readyToShip" },
  { key: "SHIPPED", label: "Shipped", countKey: "shipped" },
  { key: "DELIVERED", label: "Delivered", countKey: "delivered" },
  { key: "EXPIRING", label: "Expiring soon", countKey: "" },
];

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "expiry_asc", label: "Expiring soonest" },
  { value: "quantity_desc", label: "Largest quantity" },
];

export function BlocksClientList({ result, filters, dealers, showrooms, session }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(
    !!(filters.dealerId || filters.showroomId || filters.from || filters.to)
  );
  const [activeAction, setActiveAction] = useState<{ block: BlockRow; type: ActionType } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const role = session.role;

  // ——— URL is the source of truth for search/filter/sort/page (spec §22) ———
  const pushFilters = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams();
      const merged: Record<string, any> = { ...filters, ...updates };
      // Reset to page 1 whenever anything other than the page itself changes.
      if (!("page" in updates)) merged.page = 1;

      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === "" ) continue;
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

  // Debounced search. The input stays responsive; only the URL waits.
  const searchRef = useRef(filters.search);
  useEffect(() => {
    searchRef.current = filters.search;
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchInput === searchRef.current) return;
    const t = setTimeout(() => pushFilters({ search: searchInput }), 350);
    return () => clearTimeout(t);
    // pushFilters changes identity with `filters`; depending on it here would
    // re-arm the timer on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasFilters = !!(
    filters.search ||
    filters.status ||
    filters.dealerId ||
    filters.showroomId ||
    filters.from ||
    filters.to
  );

  const clearFilters = () => {
    setSearchInput("");
    startTransition(() => router.push(pathname, { scroll: false }));
  };

  // ——— Mutations ———
  const runAction = async (
    block: BlockRow,
    type: ActionType,
    opts: { quantity?: number; reason?: string } = {}
  ) => {
    if (busyId) return; // one mutation at a time per list

    // §39 — a mutation fired with no connection hangs rather than failing, which
    // is indistinguishable from a dead button.
    if (isOffline()) {
      toast.error(OFFLINE_MESSAGE);
      setActiveAction(null);
      return;
    }

    setBusyId(block.id);
    setActiveAction(null);

    const label = block.blockNumber || block.id.slice(-8).toUpperCase();

    try {
      const res =
        type === "APPROVE" ? await approveBlockAction(block.id, opts.quantity)
        : type === "REJECT" ? await rejectBlockAction(block.id, opts.reason)
        : type === "SHIP" ? await shipBlockAction(block.id, opts.quantity)
        : type === "DELIVER" ? await deliverBlockAction(block.id, opts.quantity)
        : type === "RELEASE" ? await releaseBlockAction(block.id, opts.reason)
        : await cancelBlockAction(block.id, opts.reason);

      if (!res.ok) {
        toast.error(res.error);
        // The block moved on under us — pull the current state in.
        if (res.code === "CONFLICT") startTransition(() => router.refresh());
        return;
      }

      const past =
        type === "APPROVE" ? "approved"
        : type === "REJECT" ? "rejected"
        : type === "SHIP" ? "shipped"
        : type === "DELIVER" ? "marked delivered"
        : type === "RELEASE" ? "released"
        : "cancelled";

      toast.success(`Block ${label} ${past}.`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Connection failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (block: BlockRow) => {
    const status = block.status as BlockStatus;
    const ctx = {
      createdById: block.createdById,
      actorId: session.userId,
      blockShowroomId: block.showroomId,
      actorShowroomId: session.showroomId,
    };

    return {
      approve: canApproveBlock(role, status, ctx),
      reject: canRejectBlock(role, status, ctx),
      readyToShip: canMarkReadyToShip(role, status),
      ship: canShipBlock(role, status),
      deliver: canDeliverBlock(role, status),
      cancel: canCancelBlock(role, status, ctx),
      release: canReleaseBlock(role, status),
    };
  };

  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.limit + 1;
  const rangeEnd = Math.min(result.page * result.limit, result.total);

  return (
    <div className="space-y-4">
      {/* ——— HEADER ——— */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#111111] sm:text-2xl">
            Stock Blocks
          </h1>
          <p className="text-xs text-[#6B6B6B]">
            Reservation requests, approvals, shipment and delivery.
          </p>
        </div>

        {(role === "SUPER_ADMIN" ||
          role === "MANAGER" ||
          role === "SHOWROOM_INCHARGE" ||
          role === "SHOWROOM_STAFF") && (
          <Link
            href="/blocks/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#F2C202] px-4 text-xs font-black text-white shadow-xs transition-all hover:bg-[#D8AD02] active:scale-[0.99]"
          >
            + New Block
          </Link>
        )}
      </div>

      {/* ——— TABS ——— */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max min-w-full items-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-white p-1 shadow-xs">
          {TABS.map((tab) => {
            const active = filters.status === tab.key;
            const count = tab.countKey ? result.counts[tab.countKey] : undefined;
            return (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => pushFilters({ status: tab.key })}
                className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition-all ${
                  active
                    ? "bg-[#F2C202] text-white shadow-xs"
                    : "text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
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

      {/* ——— SEARCH + FILTERS ——— */}
      <div className="space-y-3 rounded-xl border border-[#EAEAEA] bg-white p-3 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] px-3 focus-within:border-[#F2C202] focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Block number, dealer, product, showroom…"
              aria-label="Search blocks"
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-all ${
                showFilters || filters.dealerId || filters.showroomId || filters.from || filters.to
                  ? "border-[#F2C202] bg-[#FFFBEB] text-[#8A7300]"
                  : "border-[#EAEAEA] bg-white text-[#6B6B6B] hover:bg-[#F7F7F5]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>

            <select
              value={filters.sort}
              onChange={(e) => pushFilters({ sort: e.target.value })}
              aria-label="Sort blocks"
              className="min-h-[44px] rounded-xl border border-[#EAEAEA] bg-white px-3 text-[11px] font-bold text-[#6B6B6B] outline-hidden focus:border-[#F2C202]"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-2 border-t border-[#EAEAEA] pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Dealer</span>
              <select
                value={filters.dealerId}
                onChange={(e) => pushFilters({ dealerId: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-[#EAEAEA] bg-white px-3 text-xs outline-hidden focus:border-[#F2C202]"
              >
                <option value="">All dealers</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.dealerId ? `${d.dealerId} — ${d.name}` : d.name}
                  </option>
                ))}
              </select>
            </label>

            {showrooms.length > 0 && (
              <label className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Showroom</span>
                <select
                  value={filters.showroomId}
                  onChange={(e) => pushFilters({ showroomId: e.target.value })}
                  className="min-h-[44px] w-full rounded-xl border border-[#EAEAEA] bg-white px-3 text-xs outline-hidden focus:border-[#F2C202]"
                >
                  <option value="">All showrooms</option>
                  {showrooms.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Created from</span>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => pushFilters({ from: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-[#EAEAEA] bg-white px-3 text-xs outline-hidden focus:border-[#F2C202]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-[#6B6B6B]">Created to</span>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => pushFilters({ to: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-[#EAEAEA] bg-white px-3 text-xs outline-hidden focus:border-[#F2C202]"
              />
            </label>
          </div>
        )}
      </div>

      {/* ——— RESULTS ——— */}
      {isPending ? (
        <BlocksSkeleton rows={Math.min(result.limit, 6)} />
      ) : result.items.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                  <tr>
                    <th className="px-4 py-3.5">Block</th>
                    <th className="px-4 py-3.5">Product</th>
                    <th className="px-4 py-3.5">Dealer / Showroom</th>
                    <th className="px-4 py-3.5 text-right">Qty</th>
                    <th className="px-4 py-3.5">Created by</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Expiry</th>
                    <th className="px-4 py-3.5">Updated</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA] text-[#111111]">
                  {result.items.map((block) => {
                    const can = actionsFor(block);
                    const busy = busyId === block.id;

                    return (
                      <tr key={block.id} className="transition-colors hover:bg-[#F7F7F5]/60">
                        <td className="px-4 py-3.5 align-top">
                          <Link
                            href={`/blocks/${block.id}`}
                            className="font-mono text-[10.5px] font-bold text-[#111111] underline-offset-2 hover:underline"
                          >
                            {block.blockNumber || block.id.slice(-8).toUpperCase()}
                          </Link>
                          <p className="mt-0.5 text-[10px] text-[#6B6B6B]">{formatDate(block.createdAt)}</p>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <p className="font-bold">{block.product?.name || "Unknown product"}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
                            {block.product?.productNumber || "—"}
                            {block.product?.size ? ` · ${block.product.size}` : ""}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <p className="font-bold">{block.dealer?.name || "Internal hold"}</p>
                          {block.dealer?.dealerId && (
                            <p className="font-mono text-[10px] text-[#6B6B6B]">{block.dealer.dealerId}</p>
                          )}
                          {block.showroom && (
                            <p className="mt-0.5 text-[10px] font-bold text-indigo-600">{block.showroom.name}</p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right align-top font-mono font-black text-[#8A7300]">
                          {block.quantity}
                          {block.shippedQuantity > 0 && block.shippedQuantity < block.quantity && (
                            <p className="text-[9px] font-bold text-[#6B6B6B]">{block.shippedQuantity} shipped</p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <p className="font-medium">{block.requestedBy}</p>
                          {block.createdRole && (
                            <p className="text-[9.5px] uppercase tracking-wide text-[#6B6B6B]">
                              {block.createdRole.replace(/_/g, " ")}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <BlockStatusBadge status={block.status} />
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <ExpiryBadge expiresAt={block.expiresAt} status={block.status} />
                        </td>

                        <td className="px-4 py-3.5 align-top whitespace-nowrap text-[10px] text-[#6B6B6B]">
                          {relativeTime(block.lastActivityAt)}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {can.approve && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Approving…"
                                onClick={() => setActiveAction({ block, type: "APPROVE" })}
                                className="bg-emerald-600 text-white hover:bg-emerald-500"
                              >
                                Approve
                              </RowButton>
                            )}
                            {can.reject && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Rejecting…"
                                onClick={() => setActiveAction({ block, type: "REJECT" })}
                                className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              >
                                Reject
                              </RowButton>
                            )}
                            {can.readyToShip && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Updating…"
                                onClick={() => runAction(block, "APPROVE")}
                                className="bg-indigo-600 text-white hover:bg-indigo-500"
                              >
                                Ready to ship
                              </RowButton>
                            )}
                            {can.ship && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Shipping…"
                                onClick={() => setActiveAction({ block, type: "SHIP" })}
                                className="bg-blue-600 text-white hover:bg-blue-500"
                              >
                                <Truck className="h-3 w-3" /> Ship
                              </RowButton>
                            )}
                            {can.deliver && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Updating…"
                                onClick={() => setActiveAction({ block, type: "DELIVER" })}
                                className="bg-teal-600 text-white hover:bg-teal-500"
                              >
                                Delivered
                              </RowButton>
                            )}
                            {can.cancel && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Cancelling…"
                                onClick={() => setActiveAction({ block, type: "CANCEL" })}
                                className="border border-[#EAEAEA] bg-white text-[#6B6B6B] hover:bg-[#F7F7F5]"
                              >
                                Cancel
                              </RowButton>
                            )}
                            {can.release && (
                              <RowButton
                                busy={busy}
                                pendingLabel="Releasing…"
                                onClick={() => setActiveAction({ block, type: "RELEASE" })}
                                className="border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              >
                                Release
                              </RowButton>
                            )}
                            <Link
                              href={`/blocks/${block.id}`}
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-[#EAEAEA] px-2 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards — no horizontal scrolling (spec §26) */}
          <div className="space-y-3 md:hidden">
            {result.items.map((block) => {
              const can = actionsFor(block);
              const busy = busyId === block.id;

              return (
                <article key={block.id} className="space-y-3 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-[#EAEAEA] pb-2">
                    <Link
                      href={`/blocks/${block.id}`}
                      className="truncate font-mono text-[11px] font-bold text-[#111111]"
                    >
                      {block.blockNumber || block.id.slice(-8).toUpperCase()}
                    </Link>
                    <BlockStatusBadge status={block.status} />
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#EAEAEA] bg-[#F7F7F5]">
                      <Package className="h-5 w-5 text-[#6B6B6B]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#111111]">
                        {block.product?.name || "Unknown product"}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[#6B6B6B]">
                        {block.product?.productNumber || "—"}
                        {block.product?.size ? ` · ${block.product.size}` : ""}
                      </p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-center">
                    <div>
                      <dt className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Quantity</dt>
                      <dd className="mt-0.5 font-mono text-sm font-black text-[#8A7300]">{block.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Expiry</dt>
                      <dd className="mt-0.5 flex justify-center">
                        <ExpiryBadge expiresAt={block.expiresAt} status={block.status} />
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-1 text-[11px] text-[#6B6B6B]">
                    <p>
                      Dealer: <strong className="text-[#111111]">{block.dealer?.name || "Internal hold"}</strong>
                    </p>
                    {block.showroom && (
                      <p>
                        Showroom: <strong className="text-indigo-600">{block.showroom.name}</strong>
                      </p>
                    )}
                    <p>
                      Created by: <strong className="text-[#111111]">{block.requestedBy}</strong>
                      {block.createdRole ? ` (${block.createdRole.replace(/_/g, " ").toLowerCase()})` : ""}
                    </p>
                    <p>
                      Updated: <strong className="text-[#111111]">{relativeTime(block.lastActivityAt)}</strong>
                    </p>
                    {block.remarks && <p className="italic">“{block.remarks}”</p>}
                  </div>

                  <div className="flex flex-col gap-2">
                    {can.approve && (
                      <MobileButton
                        busy={busy}
                        onClick={() => setActiveAction({ block, type: "APPROVE" })}
                        className="bg-emerald-600 text-white"
                      >
                        Approve block
                      </MobileButton>
                    )}
                    {can.reject && (
                      <MobileButton
                        busy={busy}
                        onClick={() => setActiveAction({ block, type: "REJECT" })}
                        className="border border-rose-200 bg-rose-50 text-rose-700"
                      >
                        Reject block
                      </MobileButton>
                    )}
                    {can.readyToShip && (
                      <MobileButton
                        busy={busy}
                        onClick={() => runAction(block, "APPROVE")}
                        className="bg-indigo-600 text-white"
                      >
                        Mark ready to ship
                      </MobileButton>
                    )}
                    {can.ship && (
                      <MobileButton
                        busy={busy}
                        onClick={() => setActiveAction({ block, type: "SHIP" })}
                        className="bg-blue-600 text-white"
                      >
                        Ship block
                      </MobileButton>
                    )}
                    {can.deliver && (
                      <MobileButton
                        busy={busy}
                        onClick={() => setActiveAction({ block, type: "DELIVER" })}
                        className="bg-teal-600 text-white"
                      >
                        Mark delivered
                      </MobileButton>
                    )}
                    {can.cancel && (
                      <MobileButton
                        busy={busy}
                        onClick={() => setActiveAction({ block, type: "CANCEL" })}
                        className="border border-[#EAEAEA] bg-white text-[#6B6B6B]"
                      >
                        Cancel block
                      </MobileButton>
                    )}
                    <Link
                      href={`/blocks/${block.id}`}
                      className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#EAEAEA] bg-white text-xs font-bold text-[#6B6B6B]"
                    >
                      View details
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {/* ——— PAGINATION ——— */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[#EAEAEA] bg-white p-3 text-xs shadow-xs sm:flex-row">
            <p className="text-[11px] text-[#6B6B6B]">
              Showing <strong className="text-[#111111]">{rangeStart}</strong>–
              <strong className="text-[#111111]">{rangeEnd}</strong> of{" "}
              <strong className="text-[#111111]">{result.total}</strong> blocks
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={result.page <= 1}
                onClick={() => pushFilters({ page: result.page - 1 })}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#EAEAEA] px-3 text-[11px] font-bold text-[#6B6B6B] disabled:opacity-40 hover:bg-[#F7F7F5] disabled:hover:bg-transparent"
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
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#EAEAEA] px-3 text-[11px] font-bold text-[#6B6B6B] disabled:opacity-40 hover:bg-[#F7F7F5] disabled:hover:bg-transparent"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {activeAction && (
        <ActionDialog
          block={activeAction.block}
          type={activeAction.type}
          busy={busyId === activeAction.block.id}
          onClose={() => setActiveAction(null)}
          onConfirm={(opts) => runAction(activeAction.block, activeAction.type, opts)}
        />
      )}
    </div>
  );
}

// ————————————————————————————————————————————————
// Pieces
// ————————————————————————————————————————————————

/**
 * Compact "time since" for the Updated column. Absolute dates in a dense table
 * are hard to scan; "2h ago" answers the only question being asked of it.
 */
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function RowButton({
  children,
  onClick,
  busy,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  pendingLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[10px] font-black transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {busy ? pendingLabel : children}
    </button>
  );
}

function MobileButton({
  children,
  onClick,
  busy,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-xs font-black transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

/**
 * Confirmation dialog for every mutation.
 *
 * Shipping in particular gets the full picture demanded by §12 — block number,
 * dealer, product, quantity, showroom and destination — because it is the
 * irreversible step. It renders as a bottom sheet on small screens (§38).
 */
function ActionDialog({
  block,
  type,
  busy,
  onClose,
  onConfirm,
}: {
  block: BlockRow;
  type: ActionType;
  busy: boolean;
  onClose: () => void;
  onConfirm: (opts: { quantity?: number; reason?: string }) => void;
}) {
  const outstandingToShip = block.quantity - block.shippedQuantity;
  const outstandingToDeliver = block.shippedQuantity - block.deliveredQuantity;

  const [quantity, setQuantity] = useState<string>(
    type === "SHIP"
      ? String(outstandingToShip)
      : type === "DELIVER"
        ? String(outstandingToDeliver)
        : String(block.quantity)
  );
  const [reason, setReason] = useState("");

  const needsReason = type === "REJECT" || type === "RELEASE" || type === "CANCEL";
  const needsQuantity = type === "APPROVE" || type === "SHIP" || type === "DELIVER";
  const reasonRequired = type === "REJECT";

  const maxQty = type === "SHIP" ? outstandingToShip : type === "DELIVER" ? outstandingToDeliver : block.quantity;
  const qtyNum = Number(quantity);
  const qtyValid = !needsQuantity || (Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= maxQty);
  const canSubmit = qtyValid && (!reasonRequired || reason.trim().length > 0) && !busy;

  const title =
    type === "APPROVE" ? "Approve block"
    : type === "REJECT" ? "Reject block"
    : type === "SHIP" ? "Confirm shipment"
    : type === "DELIVER" ? "Confirm delivery"
    : type === "RELEASE" ? "Release hold"
    : "Cancel block";

  const confirmLabel =
    type === "APPROVE" ? "Approve block"
    : type === "REJECT" ? "Reject block"
    : type === "SHIP" ? "Confirm shipment"
    : type === "DELIVER" ? "Confirm delivery"
    : type === "RELEASE" ? "Release hold"
    : "Cancel block";

  const pendingLabel =
    type === "APPROVE" ? "Approving…"
    : type === "REJECT" ? "Rejecting…"
    : type === "SHIP" ? "Shipping…"
    : type === "DELIVER" ? "Updating…"
    : type === "RELEASE" ? "Releasing…"
    : "Cancelling…";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#EAEAEA] bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-5 py-4">
          <h2 className="text-sm font-bold text-[#111111]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <dl className="space-y-2 rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 text-[11px]">
            <Row label="Block" value={block.blockNumber || block.id.slice(-8).toUpperCase()} mono />
            <Row label="Product" value={block.product?.name || "—"} />
            <Row label="Product number" value={block.product?.productNumber || "—"} mono />
            <Row label="Dealer" value={block.dealer?.name || "Internal hold"} />
            <Row label="Showroom" value={block.showroom?.name || "—"} />
            <Row
              label="Destination"
              value={block.dealer?.name || block.showroom?.name || block.warehouse?.name || "—"}
            />
            <Row label="Quantity" value={`${block.quantity} boxes`} />
            <Row label="Current status" value={block.status.replace(/_/g, " ")} />
          </dl>

          {type === "SHIP" && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Shipping reduces physical stock and cannot be undone.
            </p>
          )}

          {needsQuantity && (
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                {type === "APPROVE" ? "Approved quantity" : type === "SHIP" ? "Quantity to ship" : "Quantity delivered"}
                {" "}(max {maxQty})
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={!qtyValid}
                className={`min-h-[48px] w-full rounded-xl border bg-white px-3 text-sm outline-hidden ${
                  qtyValid ? "border-[#EAEAEA] focus:border-[#F2C202]" : "border-rose-300"
                }`}
              />
              {!qtyValid && (
                <span className="text-[10px] font-bold text-rose-700">
                  Enter a quantity between 1 and {maxQty}.
                </span>
              )}
              {type === "APPROVE" && (
                <span className="block text-[10px] text-[#6B6B6B]">
                  Lower the number to approve part of the request; the remainder returns to available stock.
                </span>
              )}
            </label>
          )}

          {needsReason && (
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
                Reason {reasonRequired ? "(required)" : "(optional)"}
              </span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  type === "REJECT" ? "Explain why this request is being rejected" : "Add an operational note"
                }
                className="w-full rounded-xl border border-[#EAEAEA] bg-white p-3 text-sm outline-hidden focus:border-[#F2C202]"
              />
              {reasonRequired && reason.trim().length === 0 && (
                <span className="text-[10px] font-bold text-rose-700">A rejection reason is required.</span>
              )}
            </label>
          )}
        </div>

        <div className="flex gap-2 border-t border-[#EAEAEA] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[48px] flex-1 rounded-xl border border-[#EAEAEA] bg-white text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            aria-busy={busy}
            onClick={() =>
              onConfirm({
                quantity: needsQuantity ? qtyNum : undefined,
                reason: needsReason ? reason.trim() : undefined,
              })
            }
            className={`min-h-[48px] flex-1 rounded-xl text-xs font-black text-white transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
              type === "REJECT" || type === "CANCEL"
                ? "bg-rose-600 hover:bg-rose-500"
                : type === "SHIP"
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {busy ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[#6B6B6B]">{label}</dt>
      <dd className={`text-right font-bold text-[#111111] ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-10 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F7F7F5]">
        <Filter className="h-5 w-5 text-[#6B6B6B]" />
      </div>
      <h2 className="mt-3 text-sm font-bold text-[#111111]">No blocks found.</h2>
      <p className="mt-1 text-xs text-[#6B6B6B]">
        {hasFilters
          ? "No blocks match the current search and filters."
          : "Stock blocks will appear here once they are raised."}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-[#EAEAEA] bg-white px-4 text-xs font-bold text-[#111111] hover:bg-[#F7F7F5]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function BlocksSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading blocks">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-[#EAEAEA]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-[#EAEAEA]" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-[#F7F7F5]" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-[#F7F7F5]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
