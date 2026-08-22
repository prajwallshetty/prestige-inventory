"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isOffline, OFFLINE_MESSAGE } from "@/lib/offline";
import { Check, Loader2, Truck, X, AlertCircle } from "lucide-react";
import {
  approveBlockAction,
  rejectBlockAction,
  markReadyToShipAction,
  shipBlockAction,
  deliverBlockAction,
  cancelBlockAction,
} from "@/app/actions";
import {
  canApproveBlock,
  canCancelBlock,
  canDeliverBlock,
  canMarkReadyToShip,
  canRejectBlock,
  canShipBlock,
  type BlockStatus,
  type Role,
} from "@/lib/permissions";

type Action = "APPROVE" | "REJECT" | "READY" | "SHIP" | "DELIVER" | "CANCEL";

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
  block: any;
  audit: AuditEntry[];
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export function BlockDetailClient({ session, block, audit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Action | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const role = session.role as Role;
  const status = block.status as BlockStatus;
  // Scope is part of authority: an In-Charge may only act on their own
  // showroom's blocks, and the same context object is what the server checks.
  const actorCtx = {
    createdById: block.createdById,
    actorId: session.userId,
    blockShowroomId: block.showroomId ?? null,
    actorShowroomId: session.showroomId,
  };

  const run = async (
    action: Action,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string
  ) => {
    if (inFlight.current) return;

    // §39 — refuse mutations while offline rather than letting them hang.
    if (isOffline()) {
      setError(OFFLINE_MESSAGE);
      toast.error(OFFLINE_MESSAGE);
      return;
    }

    inFlight.current = true;
    setBusy(action);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error || "The action could not be completed.");
        toast.error(result.error || "The action could not be completed.");
        // Someone else moved this block on — show its real state.
        startTransition(() => router.refresh());
        return;
      }

      toast.success(successMsg);
      // Refresh in place so the timeline and status update without a manual
      // reload (spec §10).
      startTransition(() => router.refresh());
      setRejectOpen(false);
      setShipOpen(false);
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

  const statusStyle = (s: string) =>
    s === "DELIVERED" ? "border-purple-200 bg-purple-50 text-purple-700"
    : s === "SHIPPED" || s === "PARTIALLY_SHIPPED" ? "border-blue-200 bg-blue-50 text-blue-700"
    : s === "READY_TO_SHIP" ? "border-indigo-200 bg-indigo-50 text-indigo-700"
    : s === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : s.startsWith("PENDING") ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-rose-200 bg-rose-50 text-rose-700";

  // Timeline derived from real state (spec §28) — never hardcoded as complete.
  const steps = [
    { label: "Created", done: true, sub: [block.requestedBy, fmt(block.createdAt)].filter(Boolean).join(" · ") },
    ...(block.approvalRoute === "INCHARGE"
      ? [{
          label: "In-Charge Approved",
          done: !!block.inchargeApprovedAt,
          sub: block.inchargeApprovedBy ? `${block.inchargeApprovedBy} · ${fmt(block.inchargeApprovedAt)}` : "Waiting",
        }]
      : []),
    {
      label: "Manager Approved",
      done: !!block.managerApprovedAt,
      sub: block.managerApprovedBy ? `${block.managerApprovedBy} · ${fmt(block.managerApprovedAt)}` : "Waiting",
    },
    { label: "Ready to Ship", done: !!block.readyToShipAt, sub: fmt(block.readyToShipAt) || "—" },
    {
      label: block.status === "PARTIALLY_SHIPPED" ? "Partially Shipped" : "Shipped",
      done: !!block.shippedAt,
      sub: block.shippedQuantity ? `${block.shippedQuantity} boxes · ${fmt(block.shippedAt)}` : "—",
    },
    {
      label: "Delivered",
      done: block.status === "DELIVERED",
      sub: block.deliveredQuantity ? `${block.deliveredQuantity} boxes · ${fmt(block.deliveredAt)}` : "—",
    },
  ];

  const showApprove = canApproveBlock(role, status, actorCtx);
  const showReject = canRejectBlock(role, status, actorCtx);
  const showReady = canMarkReadyToShip(role, status);
  const showShip = canShipBlock(role, status);
  const showDeliver = canDeliverBlock(role, status);
  const showCancel = canCancelBlock(role, status, actorCtx);
  const hasActions = showApprove || showReject || showReady || showShip || showDeliver || showCancel;

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-black text-[#111111]">{block.blockNumber || block.id.slice(-8)}</p>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">
              {block.quantity} boxes
              {block.expiresAt && ` · expires ${fmt(block.expiresAt)}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(status)}`}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* DETAILS — stacked on mobile, two columns from sm up */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
          <h2 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Product</h2>
          {block.product ? (
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B6B6B]">Name</dt>
                <dd className="text-right font-bold text-[#111111]">{block.product.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B6B6B]">Number</dt>
                <dd className="text-right font-mono text-[#111111]">{block.product.productNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B6B6B]">Size</dt>
                <dd className="text-right text-[#111111]">{block.product.size || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B6B6B]">Brand</dt>
                <dd className="text-right text-[#111111]">{block.product.brand || "—"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs italic text-[#6B6B6B]">Product record unavailable.</p>
          )}
        </section>

        <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
          <h2 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Context</h2>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B6B6B]">Dealer</dt>
              <dd className="text-right font-bold text-[#111111]">
                {block.dealer ? (
                  <>
                    {block.dealer.dealerId && (
                      <span className="block font-mono text-[10px] text-[#8A7300]">{block.dealer.dealerId}</span>
                    )}
                    {block.dealer.name}
                  </>
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B6B6B]">Showroom</dt>
              <dd className="text-right text-[#111111]">{block.showroom?.name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B6B6B]">Created by</dt>
              <dd className="text-right text-[#111111]">{block.requestedBy}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B6B6B]">Created role</dt>
              <dd className="text-right text-[#111111]">{block.createdRole?.replace(/_/g, " ") || "—"}</dd>
            </div>
            {block.remarks && (
              <div className="pt-2 border-t border-[#EAEAEA]">
                <dt className="text-[#6B6B6B] mb-1">Remarks</dt>
                <dd className="text-[#111111]">{block.remarks}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* TIMELINE */}
      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-5 shadow-xs">
        <h2 className="mb-4 text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">Approval Timeline</h2>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-black ${
                    s.done ? "border-emerald-300 bg-emerald-500 text-white" : "border-[#EAEAEA] bg-white text-[#9A9A9A]"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-[#EAEAEA]" />}
              </div>
              <div className="pb-1 min-w-0">
                <p className={`text-xs font-bold ${s.done ? "text-[#111111]" : "text-[#9A9A9A]"}`}>{s.label}</p>
                <p className="text-[10px] text-[#6B6B6B] break-words">{s.sub}</p>
              </div>
            </li>
          ))}
        </ol>
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

      {/* ACTIONS — large tap targets, stacked on mobile */}
      {hasActions && (
        <section className="sticky bottom-0 -mx-4 space-y-2 border-t border-[#EAEAEA] bg-white/95 p-4 backdrop-blur-md sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-5 sm:backdrop-blur-none">
          {showApprove && (
            <button
              onClick={() => run("APPROVE", () => approveBlockAction(block.id), "Block approved.")}
              disabled={!!busy}
              aria-busy={busy === "APPROVE"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-emerald-500 disabled:opacity-50 min-h-[48px]"
            >
              {busy === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy === "APPROVE" ? "Approving..." : "Approve Block"}
            </button>
          )}

          {showReady && (
            <button
              onClick={() => run("READY", () => markReadyToShipAction(block.id), "Marked ready to ship.")}
              disabled={!!busy}
              aria-busy={busy === "READY"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-indigo-500 disabled:opacity-50 min-h-[48px]"
            >
              {busy === "READY" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "READY" ? "Updating..." : "Mark Ready to Ship"}
            </button>
          )}

          {showShip && (
            <button
              onClick={() => setShipOpen(true)}
              disabled={!!busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-blue-500 disabled:opacity-50 min-h-[48px]"
            >
              <Truck className="h-4 w-4" /> Ship Block
            </button>
          )}

          {showDeliver && (
            <button
              onClick={() => run("DELIVER", () => deliverBlockAction(block.id), "Marked delivered.")}
              disabled={!!busy}
              aria-busy={busy === "DELIVER"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.99] hover:bg-teal-500 disabled:opacity-50 min-h-[48px]"
            >
              {busy === "DELIVER" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "DELIVER" ? "Updating..." : "Mark Delivered"}
            </button>
          )}

          {showReject && (
            <button
              onClick={() => setRejectOpen(true)}
              disabled={!!busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-3.5 text-sm font-black text-rose-700 transition-all active:scale-[0.99] hover:bg-rose-100 disabled:opacity-50 min-h-[48px]"
            >
              <X className="h-4 w-4" /> Reject
            </button>
          )}

          {showCancel && (
            <button
              onClick={() => {
                if (confirm("Cancel this block and release its stock?")) {
                  run("CANCEL", () => cancelBlockAction(block.id, "Cancelled by requester."), "Block cancelled.");
                }
              }}
              disabled={!!busy}
              aria-busy={busy === "CANCEL"}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-white py-3.5 text-sm font-bold text-[#6B6B6B] transition-all active:scale-[0.99] hover:bg-[#F7F7F5] disabled:opacity-50 min-h-[48px]"
            >
              {busy === "CANCEL" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "CANCEL" ? "Cancelling..." : "Cancel Block"}
            </button>
          )}
        </section>
      )}

      {/* REJECT MODAL — reason is mandatory (spec §15) */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setRejectOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-lg">
            <h2 className="text-sm font-black uppercase text-[#111111]">Reject Block</h2>
            <p className="mt-1 text-xs text-[#6B6B6B]">
              {block.blockNumber} · {block.quantity} boxes
            </p>
            <label htmlFor="reject-reason" className="mt-4 block text-[10px] font-black uppercase text-[#6B6B6B]">
              Reason *
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Insufficient stock"
              className="mt-1 w-full rounded-xl border border-[#EAEAEA] p-3 text-sm outline-hidden focus:border-[#F2C202]"
            />
            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => setRejectOpen(false)}
                className="flex-1 rounded-xl border border-[#EAEAEA] bg-white py-3 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => run("REJECT", () => rejectBlockAction(block.id, reason.trim()), "Block rejected.")}
                disabled={!reason.trim() || !!busy}
                aria-busy={busy === "REJECT"}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-xs font-black text-white hover:bg-rose-500 disabled:opacity-50 min-h-[44px]"
              >
                {busy === "REJECT" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {busy === "REJECT" ? "Rejecting..." : "Reject Block"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIP CONFIRMATION (spec §18) */}
      {shipOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShipOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-lg">
            <h2 className="text-sm font-black uppercase text-[#111111]">Ship Block</h2>
            <dl className="mt-3 space-y-1.5 rounded-xl bg-[#F7F7F5] p-3 text-xs">
              <div className="flex justify-between"><dt className="text-[#6B6B6B]">Block</dt><dd className="font-mono font-bold">{block.blockNumber}</dd></div>
              <div className="flex justify-between"><dt className="text-[#6B6B6B]">Dealer</dt><dd className="font-bold">{block.dealer?.name || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[#6B6B6B]">Product</dt><dd className="font-bold text-right">{block.product?.name || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[#6B6B6B]">Quantity</dt><dd className="font-bold">{block.quantity} boxes</dd></div>
              <div className="flex justify-between"><dt className="text-[#6B6B6B]">Destination</dt><dd className="font-bold">{block.showroom?.name || block.warehouse?.name || "—"}</dd></div>
            </dl>
            <p className="mt-3 text-[10px] text-[#6B6B6B]">
              Shipping reduces physical stock and consumes the reservation.
            </p>
            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => setShipOpen(false)}
                className="flex-1 rounded-xl border border-[#EAEAEA] bg-white py-3 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => run("SHIP", () => shipBlockAction(block.id), "Block shipped.")}
                disabled={!!busy}
                aria-busy={busy === "SHIP"}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50 min-h-[44px]"
              >
                {busy === "SHIP" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {busy === "SHIP" ? "Shipping..." : "Confirm Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
