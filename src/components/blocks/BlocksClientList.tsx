"use client";

import React, { useState } from "react";
import { 
  approveBlockAction, 
  releaseBlockAction, 
  rejectBlockAction, 
  confirmBlockAction, 
  deliverBlockAction 
} from "@/app/actions";
import { 
  Check, 
  X, 
  Clock, 
  Truck, 
  Info, 
  HelpCircle, 
  Sliders, 
  ChevronRight, 
  FileText,
  AlertCircle
} from "lucide-react";

interface BlocksClientListProps {
  blocks: any[];
  session: any;
}

export function BlocksClientList({ blocks, session }: BlocksClientListProps) {
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [selectedBlockDetail, setSelectedBlockDetail] = useState<any | null>(null);

  // Dialog State for Actions
  const [activeAction, setActiveAction] = useState<{
    block: any;
    type: "APPROVE" | "REJECT" | "DELIVER" | "RELEASE" | "OVERRIDE";
  } | null>(null);

  // Action input states
  const [reasonInput, setReasonInput] = useState("");
  const [qtyInput, setQtyInput] = useState(0);

  const role = session?.role || "VIEWER";
  const isDealer = role === "DEALER";

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    const { block, type } = activeAction;
    setLoadingMap((prev) => ({ ...prev, [block.id]: true }));
    setActiveAction(null);

    try {
      if (type === "APPROVE") {
        await approveBlockAction(block.id, qtyInput > 0 && qtyInput < block.quantity ? qtyInput : undefined);
      } else if (type === "REJECT") {
        await rejectBlockAction(block.id, reasonInput);
      } else if (type === "DELIVER") {
        await deliverBlockAction(block.id, qtyInput);
      } else if (type === "RELEASE") {
        await releaseBlockAction(block.id, reasonInput);
      } else if (type === "OVERRIDE") {
        // Admin override can adjust quantity or status
        await approveBlockAction(block.id, qtyInput);
      }
      window.location.reload();
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [block.id]: false }));
    }
  };

  const openActionDialog = (block: any, type: "APPROVE" | "REJECT" | "DELIVER" | "RELEASE" | "OVERRIDE") => {
    setActiveAction({ block, type });
    setReasonInput("");
    setQtyInput(block.quantity);
  };

  const handleCancelStaff = async (id: string) => {
    const confirmMsg = "Are you sure you want to cancel this pending block reservation?";
    if (!confirm(confirmMsg)) return;

    setLoadingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await rejectBlockAction(id, "Cancelled by requesting staff member.");
      window.location.reload();
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleConfirmDealer = async (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await confirmBlockAction(id);
      window.location.reload();
    } catch (err: any) {
      alert(`Confirmation failed: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Stepper helper for visual timeline
  const getTimelineSteps = (block: any) => {
    const isFulfilled = block.status === "DELIVERED" || block.status === "FULFILLED";
    const isPartial = block.status === "PARTIALLY_FULFILLED";
    const isConfirmed = block.status === "CONFIRMED" || isPartial || isFulfilled;
    const isApproved = block.status === "APPROVED" || isConfirmed;
    const isReleased = block.status === "RELEASED";
    const isExpired = block.status === "EXPIRED";
    const isRejected = block.status === "REJECTED";
    const isCancelled = block.status === "CANCELLED";

    return [
      { label: "Created", done: true },
      { 
        label: isRejected ? "Rejected" : isCancelled ? "Cancelled" : "Approved", 
        done: isApproved, 
        err: isRejected || isCancelled,
        sub: block.approvedBy ? `By ${block.approvedBy}` : null 
      },
      { label: isExpired ? "Expired" : "Blocked", done: isApproved && !isReleased && !isExpired, err: isExpired },
      { label: "Confirmed", done: isConfirmed },
      { label: isPartial ? "Partially Dispatched" : "Dispatched", done: isPartial || isFulfilled },
      { label: "Delivered", done: isFulfilled }
    ];
  };

  return (
    <div className="space-y-4">
      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-4 font-mono">Block ID</th>
              <th className="px-4 py-4">Product details</th>
              {!isDealer && <th className="px-4 py-4">Dealer / Showroom</th>}
              {!isDealer && <th className="px-4 py-4">Blocked By</th>}
              <th className="px-4 py-4 text-right">Quantity</th>
              <th className="px-4 py-4">Expiry Timer</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={isDealer ? 6 : 8} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No stock reservations found.
                </td>
              </tr>
            ) : (
              blocks.map((block) => {
                const prod = block.inventory?.product || {};
                const isPendingIncharge = block.status === "PENDING_INCHARGE_APPROVAL";
                const isPendingManager = block.status === "PENDING_MANAGER_APPROVAL";
                const isPending = isPendingIncharge || isPendingManager;

                return (
                  <tr key={block.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                    {/* ID */}
                    <td className="px-4 py-3.5 font-mono text-[10.5px] text-[#6B6B6B]">
                      #{block.block_number || block.id.slice(-8).toUpperCase()}
                    </td>

                    {/* Product */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#111111]">
                          {prod.name || "Unknown Product"}
                        </span>
                        <span className="text-[10px] text-[#6B6B6B] font-mono mt-0.5">
                          SKU: {prod.sku || "N/A"} | Brand: {prod.brand?.name || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Dealer / Showroom */}
                    {!isDealer && (
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#111111]">{block.dealer?.name || block.requestedBy}</p>
                        {block.showroom && (
                          <p className="text-[10px] text-indigo-600 font-bold mt-0.5">
                            Showroom: {block.showroom.name}
                          </p>
                        )}
                        {block.remarks && <p className="text-[10px] text-[#6B6B6B] italic mt-1 font-normal">"{block.remarks}"</p>}
                      </td>
                    )}

                    {/* Blocked By */}
                    {!isDealer && (
                      <td className="px-4 py-3.5">
                        {block.blocked_by ? (
                          <span className="inline-flex items-center rounded-md bg-[#F7F7F5] px-1.5 py-0.5 text-[10px] font-bold text-[#6B6B6B] border border-[#EAEAEA]">
                            {block.blocked_by === "SAMSHUDIN" ? "Samshudin" : "Salman"}
                          </span>
                        ) : (
                          <span className="text-[#6B6B6B]/40">—</span>
                        )}
                      </td>
                    )}

                    {/* Qty */}
                    <td className="px-4 py-3.5 text-right font-black text-[#8A7300] font-mono">
                      {block.quantity} Box
                    </td>

                    {/* Timer */}
                    <td className="px-4 py-3.5">
                      <TimeRemainingBadge expiresAt={block.expiresAt} status={block.status} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <BlockStatusBadge status={block.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedBlockDetail(block)}
                          className="rounded-lg p-1.5 border border-[#EAEAEA] text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                          title="View visual timeline"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>

                        {/* Route B: Showroom Incharge Approve */}
                        {isPendingIncharge && (role === "SHOWROOM_INCHARGE" || role === "SUPER_ADMIN") && (
                          <>
                            <button
                              onClick={() => openActionDialog(block, "APPROVE")}
                              disabled={loadingMap[block.id]}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white hover:bg-emerald-500 transition-all touch-target"
                            >
                              Approve Hold
                            </button>
                            <button
                              onClick={() => openActionDialog(block, "REJECT")}
                              disabled={loadingMap[block.id]}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-600 hover:text-white transition-all touch-target"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Manager / Super Admin Approve */}
                        {isPendingManager && (role === "MANAGER" || role === "SUPER_ADMIN") && (
                          <>
                            <button
                              onClick={() => openActionDialog(block, "APPROVE")}
                              disabled={loadingMap[block.id]}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white hover:bg-emerald-500 transition-all touch-target"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openActionDialog(block, "REJECT")}
                              disabled={loadingMap[block.id]}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-600 hover:text-white transition-all touch-target"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Dealer Confirmation */}
                        {block.status === "APPROVED" && role === "DEALER" && (
                          <button
                            onClick={() => handleConfirmDealer(block.id)}
                            disabled={loadingMap[block.id]}
                            className="rounded-lg bg-[#F2C202] px-2.5 py-1 text-[10px] font-black text-white hover:bg-[#D8AD02] transition-all touch-target shadow-xs"
                          >
                            Confirm Booking
                          </button>
                        )}

                        {/* Staff Cancellation */}
                        {isPending && role === "SHOWROOM_STAFF" && (
                          <button
                            onClick={() => handleCancelStaff(block.id)}
                            disabled={loadingMap[block.id]}
                            className="rounded-lg border border-[#EAEAEA] bg-white px-2 py-1 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] transition-all touch-target"
                          >
                            Cancel Request
                          </button>
                        )}

                        {/* Dispatch/Deliver Stock */}
                        {(block.status === "CONFIRMED" || block.status === "PARTIALLY_FULFILLED") && (role === "MANAGER" || role === "SUPER_ADMIN") && (
                          <button
                            onClick={() => openActionDialog(block, "DELIVER")}
                            disabled={loadingMap[block.id]}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-blue-500 transition-all touch-target flex items-center gap-1"
                          >
                            <Truck className="h-3 w-3" /> Dispatch Stock
                          </button>
                        )}

                        {/* Release active hold */}
                        {(block.status === "APPROVED" || block.status === "CONFIRMED") && (role === "MANAGER" || role === "SUPER_ADMIN") && (
                          <button
                            onClick={() => openActionDialog(block, "RELEASE")}
                            disabled={loadingMap[block.id]}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 transition-all touch-target"
                          >
                            Release Hold
                          </button>
                        )}

                        {/* Super Admin overrides */}
                        {role === "SUPER_ADMIN" && block.status !== "RELEASED" && block.status !== "DELIVERED" && (
                          <button
                            onClick={() => openActionDialog(block, "OVERRIDE")}
                            disabled={loadingMap[block.id]}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100 transition-all touch-target"
                            title="Force Admin Override"
                          >
                            Override
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MOBILE LIST CARDS */}
      <div className="md:hidden space-y-3">
        {blocks.length === 0 ? (
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-8 text-center text-xs text-[#6B6B6B] italic">
            No stock reservations found.
          </div>
        ) : (
          blocks.map((block) => {
            const prod = block.inventory?.product || {};
            const isPendingIncharge = block.status === "PENDING_INCHARGE_APPROVAL";
            const isPendingManager = block.status === "PENDING_MANAGER_APPROVAL";
            const isPending = isPendingIncharge || isPendingManager;

            return (
              <div 
                key={block.id} 
                className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm space-y-3.5"
              >
                {/* Header */}
                <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-2">
                  <span className="font-mono text-[10.5px] font-bold text-[#6B6B6B]">
                    #{block.block_number || block.id.slice(-8).toUpperCase()}
                  </span>
                  <BlockStatusBadge status={block.status} />
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-[#111111]">{prod.name || "Tile Product"}</h4>
                  <p className="text-[10px] text-[#6B6B6B]">
                    SKU: <strong className="text-[#111111]">{prod.sku || "N/A"}</strong> | Size: {prod.size || "Standard"}
                  </p>
                  
                  {!isDealer && (
                    <>
                      <p className="text-[10px] text-[#6B6B6B]">
                        Dealer: <strong className="text-[#111111]">{block.dealer?.name || block.requestedBy}</strong>
                      </p>
                      {block.showroom && (
                        <p className="text-[10px] text-indigo-600 font-bold">
                          Showroom: {block.showroom.name}
                        </p>
                      )}
                    </>
                  )}

                  {!isDealer && block.blocked_by && (
                    <p className="text-[10px] text-[#6B6B6B]">
                      Blocked By: <strong className="text-[#111111]">{block.blocked_by === "SAMSHUDIN" ? "Samshudin" : "Salman"}</strong>
                    </p>
                  )}

                  {!isDealer && block.remarks && (
                    <p className="text-[10px] text-[#6B6B6B] italic font-normal">
                      Remarks: "{block.remarks}"
                    </p>
                  )}
                </div>

                {/* Stepper info */}
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#EAEAEA] bg-[#F7F7F5] rounded-lg text-center text-xs">
                  <div>
                    <p className="text-[8.5px] uppercase font-bold text-[#6B6B6B]">Quantity</p>
                    <p className="font-black text-[#8A7300] mt-0.5">{block.quantity} Box</p>
                  </div>
                  <div>
                    <p className="text-[8.5px] uppercase font-bold text-[#6B6B6B]">Expiry</p>
                    <div className="mt-0.5 flex justify-center">
                      <TimeRemainingBadge expiresAt={block.expiresAt} status={block.status} />
                    </div>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="flex gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => setSelectedBlockDetail(block)}
                    className="flex-1 rounded-lg border border-[#EAEAEA] py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] transition-all flex items-center justify-center gap-1 touch-target"
                  >
                    Timeline Details
                  </button>

                  {/* Showroom Incharge approve */}
                  {isPendingIncharge && (role === "SHOWROOM_INCHARGE" || role === "SUPER_ADMIN") && (
                    <>
                      <button
                        onClick={() => openActionDialog(block, "APPROVE")}
                        className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-500 transition-all touch-target"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openActionDialog(block, "REJECT")}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 py-2 text-xs font-black text-rose-700 hover:bg-rose-600 hover:text-white transition-all touch-target"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {/* Manager approve */}
                  {isPendingManager && (role === "MANAGER" || role === "SUPER_ADMIN") && (
                    <>
                      <button
                        onClick={() => openActionDialog(block, "APPROVE")}
                        className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-500 transition-all touch-target"
                      >
                        Approve Request
                      </button>
                      <button
                        onClick={() => openActionDialog(block, "REJECT")}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 py-2 text-xs font-black text-rose-700 hover:bg-rose-600 hover:text-white transition-all touch-target"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {/* Dealer confirmation */}
                  {block.status === "APPROVED" && role === "DEALER" && (
                    <button
                      onClick={() => handleConfirmDealer(block.id)}
                      className="w-full rounded-lg bg-[#F2C202] py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all touch-target shadow-xs"
                    >
                      Confirm Booking
                    </button>
                  )}

                  {/* Staff cancel */}
                  {isPending && role === "SHOWROOM_STAFF" && (
                    <button
                      onClick={() => handleCancelStaff(block.id)}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] transition-all touch-target"
                    >
                      Cancel Request
                    </button>
                  )}

                  {/* Dispatch */}
                  {(block.status === "CONFIRMED" || block.status === "PARTIALLY_FULFILLED") && (role === "MANAGER" || role === "SUPER_ADMIN") && (
                    <button
                      onClick={() => openActionDialog(block, "DELIVER")}
                      className="w-full rounded-lg bg-blue-600 py-2 text-xs font-black text-white hover:bg-blue-500 transition-all touch-target flex items-center justify-center gap-1"
                    >
                      <Truck className="h-4 w-4" /> Dispatch Stock
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ACTION DIALOG MODAL */}
      {activeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setActiveAction(null)} />

          <div className="relative w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl space-y-4 text-xs text-[#111111]">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <h3 className="text-sm font-bold text-[#111111]">
                {activeAction.type === "APPROVE" && "Approve Reservation"}
                {activeAction.type === "REJECT" && "Reject Hold Request"}
                {activeAction.type === "DELIVER" && "Dispatch Physical Stock"}
                {activeAction.type === "RELEASE" && "Release Stock Block"}
                {activeAction.type === "OVERRIDE" && "Super Admin Override"}
              </h3>
              <button onClick={() => setActiveAction(null)} className="text-[#6B6B6B] hover:text-[#111111]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleActionSubmit} className="space-y-4">
              <p className="text-[#6B6B6B]">
                Block: <strong className="text-[#111111]">#{activeAction.block.block_number || activeAction.block.id.slice(-8).toUpperCase()}</strong>
                <br />
                Product: <strong className="text-[#111111]">{activeAction.block.inventory?.product?.name}</strong>
              </p>

              {/* Quantity Input (For Approval quantity adjustments or Dispatch deliveries) */}
              {(activeAction.type === "APPROVE" || activeAction.type === "DELIVER" || activeAction.type === "OVERRIDE") && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">
                    {activeAction.type === "DELIVER" ? "Quantity to Dispatch (Boxes)" : "Approved Quantity (Boxes)"}
                  </label>
                  <input
                    type="number"
                    required
                    value={qtyInput}
                    onChange={(e) => setQtyInput(parseFloat(e.target.value))}
                    max={activeAction.block.quantity}
                    min={1}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2 text-xs text-[#111111] focus:outline-hidden"
                  />
                  {activeAction.type === "APPROVE" && (
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Reduce the quantity to perform a partial approval. Remainder will return to depot.
                    </span>
                  )}
                  {activeAction.type === "DELIVER" && (
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Enter the number of boxes leaving the warehouse. Maximum available allocated: {activeAction.block.quantity}.
                    </span>
                  )}
                </div>
              )}

              {/* Reason / Remarks input (For rejections, releases, and overrides) */}
              {(activeAction.type === "REJECT" || activeAction.type === "RELEASE" || activeAction.type === "OVERRIDE") && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B6B6B] uppercase">
                    Reason / Operational Note
                  </label>
                  <textarea
                    required
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="e.g. Insufficient warehouse reserves / project status cancelled"
                    rows={2}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2 text-xs text-[#111111] focus:outline-hidden"
                  ></textarea>
                </div>
              )}

              <button
                type="submit"
                disabled={loadingMap[activeAction.block.id]}
                className="w-full rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-50 transition-all cursor-pointer text-center"
              >
                {loadingMap[activeAction.block.id] ? "Processing..." : "Confirm Action"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VISUAL TIMELINE DETAIL MODAL */}
      {selectedBlockDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setSelectedBlockDetail(null)} />

          <div className="relative w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl space-y-5 text-xs text-[#111111]">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#111111]">Reservation History & Timeline</h3>
                <p className="text-[10px] text-[#6B6B6B]">Block #{selectedBlockDetail.block_number || selectedBlockDetail.id.slice(-8).toUpperCase()}</p>
              </div>
              <button onClick={() => setSelectedBlockDetail(null)} className="text-[#6B6B6B] hover:text-[#111111]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stepper Timeline UI */}
            <div className="relative border-l border-[#EAEAEA] ml-3 pl-6 space-y-4">
              {getTimelineSteps(selectedBlockDetail).map((step, idx) => (
                <div key={idx} className="relative">
                  {/* Step Dot */}
                  <span 
                    className={`absolute -left-[30px] top-0 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-black ${
                      step.err 
                        ? "bg-rose-100 border-rose-300 text-rose-700" 
                        : step.done 
                        ? "bg-emerald-100 border-emerald-300 text-emerald-700" 
                        : "bg-white border-[#EAEAEA] text-[#6B6B6B]"
                    }`}
                  >
                    {step.done && !step.err ? "✓" : step.err ? "!" : idx + 1}
                  </span>

                  <div className="flex flex-col">
                    <span className={`font-bold ${step.err ? "text-rose-700" : step.done ? "text-[#111111]" : "text-[#6B6B6B]"}`}>
                      {step.label}
                    </span>
                    {step.sub && <span className="text-[9px] text-[#6B6B6B] mt-0.5">{step.sub}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-[#F7F7F5] border border-[#EAEAEA] p-3 space-y-1.5 text-[10px] text-[#6B6B6B]">
              <p>Requested Quantity: <strong className="text-[#111111]">{selectedBlockDetail.quantity} Box</strong></p>
              {selectedBlockDetail.approvedBy && <p>Approving Officer: <strong className="text-[#111111] font-mono">{selectedBlockDetail.approvedBy}</strong></p>}
              {selectedBlockDetail.remarks && <p>Internal remarks: <strong className="text-[#111111] italic">"{selectedBlockDetail.remarks}"</strong></p>}
              <p>Type: <strong className="text-[#111111]">{selectedBlockDetail.block_type}</strong></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockStatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    PENDING_INCHARGE_APPROVAL: "bg-orange-100 text-orange-800 border-orange-200",
    PENDING_MANAGER_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
    APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
    PARTIALLY_FULFILLED: "bg-indigo-100 text-indigo-800 border-indigo-200",
    DELIVERED: "bg-purple-100 text-purple-800 border-purple-200",
    FULFILLED: "bg-purple-100 text-purple-800 border-purple-200",
    EXPIRED: "bg-rose-100 text-rose-800 border-rose-200",
    RELEASED: "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]",
    REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
    CANCELLED: "bg-rose-100 text-rose-800 border-rose-200"
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${badgeMap[status] || "bg-amber-100 text-amber-800 border-amber-200"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function TimeRemainingBadge({ expiresAt, status }: { expiresAt?: string; status: string }) {
  const activeStates = ["APPROVED", "PENDING", "PENDING_INCHARGE_APPROVAL", "PENDING_MANAGER_APPROVAL"];
  if (!activeStates.includes(status)) {
    return <span className="text-[10px] text-[#6B6B6B]">—</span>;
  }

  if (!expiresAt) return <span className="text-[10px] text-[#6B6B6B]">No Expiry</span>;

  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-700">Expired</span>;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-[#8A7300]">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{hours}h {mins}m</span>
    </span>
  );
}
