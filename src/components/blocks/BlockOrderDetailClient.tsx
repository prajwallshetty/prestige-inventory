"use client";

import React, { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { isOffline, OFFLINE_MESSAGE } from "@/lib/offline";
import { Check, Loader2, X, AlertCircle, Package } from "lucide-react";
import { approveBlockOrderAction, rejectBlockOrderAction, cancelBlockOrderAction, type OrderItemActionOutcome } from "@/app/actions";
import { canApproveBlock, canCancelBlock, canRejectBlock, type BlockStatus, type Role } from "@/lib/permissions";

type Action = "APPROVE" | "REJECT" | "CANCEL";

interface OrderItem {
  id: string;
  blockNumber: string | null;
  status: string;
  quantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  shortageQuantity: number;
  availableQuantity: number;
  procurementStatus: string;
  procurementShipment: { id: string; shipmentNumber: string; status: string } | null;
  createdById: string | null;
  product: { id: string; name: string; productNumber: string; size: string | null; brand: string | null; thumbnailKey: string | null } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  from: string | null;
  to: string | null;
  performedBy: string | null;
  reason: string | null;
  role: string | null;
  createdAt: string;
}

interface Props {
  session: { userId: string; name: string; role: string; showroomId: string | null };
  order: {
    id: string;
    orderNumber: string;
    showroomId: string | null;
    requestedBy: string;
    createdById: string | null;
    createdRole: string | null;
    approvalRoute: string;
    remarks: string | null;
    createdAt: string;
    expiresAt: string | null;
    dealer: { id: string; dealerId: string | null; name: string; company: string | null; phone: string | null } | null;
    showroom: { id: string; name: string; city: string | null } | null;
    warehouse: { id: string; name: string } | null;
    items: OrderItem[];
  };
  audit: AuditEntry[];
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

const PROCUREMENT_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Not required",
  NEED_TO_ORDER: "Needs to be ordered",
  ORDERED: "Ordered",
  IN_TRANSIT: "In transit",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CANCELLED: "PO cancelled",
};

export function BlockOrderDetailClient({ session, order, audit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Action | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [itemResults, setItemResults] = useState<OrderItemActionOutcome[] | null>(null);
  const inFlight = useRef(false);

  const role = session.role as Role;
  const actorCtx = {
    createdById: order.createdById,
    actorId: session.userId,
    blockShowroomId: order.showroomId,
    actorShowroomId: session.showroomId,
  };

  // All items move together in the normal case; if a prior partial failure
  // left them out of sync, surface that plainly rather than guessing.
  const statuses = new Set(order.items.map((i) => i.status));
  const commonStatus = statuses.size === 1 ? ([...statuses][0] as BlockStatus) : null;
  const mixed = statuses.size > 1;

  const showApprove = commonStatus ? canApproveBlock(role, commonStatus, actorCtx) : false;
  const showReject = commonStatus ? canRejectBlock(role, commonStatus, actorCtx) : false;
  const showCancel = commonStatus ? canCancelBlock(role, commonStatus, actorCtx) : false;
  const hasActions = showApprove || showReject || showCancel;

  const totalRequested = order.items.reduce((s, i) => s + i.quantity, 0);
  const totalAvailable = order.items.reduce((s, i) => s + i.availableQuantity, 0);
  const totalShortage = order.items.reduce((s, i) => s + i.shortageQuantity, 0);

  const run = async (action: Action, fn: () => Promise<{ ok: boolean; error?: string; data?: { results: OrderItemActionOutcome[] } }>, successMsg: string) => {
    if (inFlight.current) return;
    if (isOffline()) {
      setError(OFFLINE_MESSAGE);
      toast.error(OFFLINE_MESSAGE);
      return;
    }

    inFlight.current = true;
    setBusy(action);
    setError(null);
    setItemResults(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error || "The action could not be completed.");
        toast.error(result.error || "The action could not be completed.");
        startTransition(() => router.refresh());
        return;
      }

      const results = result.data?.results ?? [];
      const failed = results.filter((r) => !r.ok);
      setItemResults(results);
      if (failed.length > 0) {
        toast.error(`${results.length - failed.length} of ${results.length} items succeeded — ${failed.length} failed.`);
      } else {
        toast.success(successMsg);
      }
      startTransition(() => router.refresh());
      setRejectOpen(false);
      setReason("");
    } catch {
      const message = "Connection failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-black text-[#111111]">{order.orderNumber}</p>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">
              {order.items.length} product{order.items.length > 1 ? "s" : ""} · {totalRequested} boxes
              {order.expiresAt && ` · expires ${fmt(order.expiresAt)}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${mixed ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[#EAEAEA] bg-[#F7F7F5] text-[#111111]"}`}>
            {mixed ? "Mixed status" : commonStatus?.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {totalShortage > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 shadow-xs">
          <h2 className="mb-3 text-[10px] font-black uppercase tracking-wider text-amber-800">Procurement Summary</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[9px] font-bold uppercase text-amber-700">Total Requested</p>
              <p className="text-base font-black text-[#111111]">{totalRequested}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-amber-700">Available</p>
              <p className="text-base font-black text-emerald-700">{totalAvailable}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-amber-700">Need to Order</p>
              <p className="text-base font-black text-amber-700">{totalShortage}</p>
            </div>
          </div>
        </section>
      )}

      {/* ITEMS */}
      <section className="space-y-2.5">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
          Products ({order.items.length})
        </h2>
        {order.items.map((item) => (
          <Link
            key={item.id}
            href={`/blocks/${item.id}`}
            className="block rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs hover:border-[#F2C202] transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#EAEAEA] bg-[#F7F7F5]">
                <Package className="h-5 w-5 text-[#6B6B6B]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#111111]">{item.product?.name || "Unknown product"}</p>
                <p className="font-mono text-[10px] text-[#6B6B6B]">
                  {item.product?.productNumber} {item.product?.size ? `· ${item.product.size}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusStyle(item.status)}`}>
                {item.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-center">
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Requested</p>
                <p className="mt-0.5 font-mono text-sm font-black text-[#111111]">{item.quantity}</p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Available</p>
                <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">{item.availableQuantity}</p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase text-[#6B6B6B]">Need to Order</p>
                <p className="mt-0.5 font-mono text-sm font-black text-amber-700">{item.shortageQuantity}</p>
              </div>
            </div>

            {item.shortageQuantity > 0 && (
              <p className="mt-2 text-[10px] font-bold text-amber-800">
                Procurement: {PROCUREMENT_LABELS[item.procurementStatus] || item.procurementStatus}
                {item.procurementShipment ? ` · ${item.procurementShipment.shipmentNumber}` : ""}
              </p>
            )}

            {itemResults?.find((r) => r.blockId === item.id && !r.ok) && (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] font-bold text-rose-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {itemResults.find((r) => r.blockId === item.id)?.error}
              </p>
            )}
          </Link>
        ))}
      </section>

      {/* CONTEXT */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Context</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-[#6B6B6B]">Dealer</dt>
          <dd className="text-right font-bold text-[#111111]">{order.dealer?.name || "—"}</dd>
          <dt className="text-[#6B6B6B]">Showroom</dt>
          <dd className="text-right text-[#111111]">{order.showroom?.name || "—"}</dd>
          <dt className="text-[#6B6B6B]">Created by</dt>
          <dd className="text-right text-[#111111]">{order.requestedBy}</dd>
          <dt className="text-[#6B6B6B]">Created role</dt>
          <dd className="text-right text-[#111111]">{order.createdRole?.replace(/_/g, " ") || "—"}</dd>
          {order.remarks && (
            <>
              <dt className="col-span-2 pt-2 border-t border-[#EAEAEA] text-[#6B6B6B]">Remarks</dt>
              <dd className="col-span-2 text-[#111111]">{order.remarks}</dd>
            </>
          )}
        </dl>
      </section>

      {/* AUDIT */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Audit History</h2>
        {audit.length === 0 ? (
          <p className="text-xs italic text-[#6B6B6B]">No audit entries recorded.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-[11px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-bold text-[#111111]">{a.action.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-[#6B6B6B]">{fmt(a.createdAt)}</span>
                </div>
                <p className="text-[10px] text-[#6B6B6B]">
                  {a.performedBy || "System"}
                  {a.role && ` (${a.role.replace(/_/g, " ")})`}
                  {a.from && a.to && ` · ${a.from.replace(/_/g, " ")} → ${a.to.replace(/_/g, " ")}`}
                </p>
                {a.reason && <p className="mt-0.5 text-[10px] italic text-[#6B6B6B]">Reason: {a.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {mixed && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This order's items are no longer all in the same stage — open each product above to see its own status.</span>
        </div>
      )}

      {hasActions && (
        <section className="sticky bottom-0 -mx-4 space-y-2 border-t border-[#EAEAEA] bg-white/95 p-4 backdrop-blur-md sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-5 sm:backdrop-blur-none">
          {showApprove && (
            <button
              onClick={() => run("APPROVE", () => approveBlockOrderAction(order.id), "Order approved.")}
              disabled={!!busy}
              aria-busy={busy === "APPROVE"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-emerald-500 disabled:opacity-50 min-h-[48px]"
            >
              {busy === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy === "APPROVE" ? "Approving..." : `Approve Order (${order.items.length} items)`}
            </button>
          )}
          {showReject && (
            <button
              onClick={() => setRejectOpen(true)}
              disabled={!!busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-3.5 text-sm font-black text-rose-700 transition-all active:scale-[0.99] hover:bg-rose-100 disabled:opacity-50 min-h-[48px]"
            >
              <X className="h-4 w-4" /> Reject Order
            </button>
          )}
          {showCancel && (
            <button
              onClick={() => {
                if (confirm(`Cancel order ${order.orderNumber} and release all its stock?`)) {
                  run("CANCEL", () => cancelBlockOrderAction(order.id, "Cancelled by requester."), "Order cancelled.");
                }
              }}
              disabled={!!busy}
              aria-busy={busy === "CANCEL"}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-white py-3.5 text-sm font-bold text-[#6B6B6B] transition-all active:scale-[0.99] hover:bg-[#F7F7F5] disabled:opacity-50 min-h-[48px]"
            >
              {busy === "CANCEL" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "CANCEL" ? "Cancelling..." : "Cancel Order"}
            </button>
          )}
        </section>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-[#111111]">Reject Order</h2>
              <button onClick={() => setRejectOpen(false)} className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label htmlFor="reject-reason" className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">
              Reason *
            </label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#EAEAEA] p-2.5 text-sm outline-hidden focus:border-rose-400"
              placeholder="Why is this order being rejected?"
            />
            <button
              onClick={() => run("REJECT", () => rejectBlockOrderAction(order.id, reason), "Order rejected.")}
              disabled={!!busy || !reason.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black text-white disabled:opacity-50 min-h-[46px]"
            >
              {busy === "REJECT" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "REJECT" ? "Rejecting..." : "Confirm Rejection"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusStyle(status: string) {
  switch (status) {
    case "DELIVERED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "SHIPPED":
    case "PARTIALLY_SHIPPED":
    case "PARTIALLY_DELIVERED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "READY_TO_SHIP":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "REJECTED":
    case "CANCELLED":
    case "EXPIRED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]";
  }
}
