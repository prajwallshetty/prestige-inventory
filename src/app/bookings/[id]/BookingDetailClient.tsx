"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  ArrowLeft, 
  Download, 
  User,
  MapPin,
  ShieldAlert,
  Sliders,
  Play
} from "lucide-react";
import Link from "next/link";
import { SessionContext } from "@/lib/session";
import { 
  reviewBookingAction, 
  confirmBookingAction, 
  cancelBookingAction, 
  requestBookingExtensionAction, 
  reviewExtensionAction,
  allocateBookingStockAction,
  fulfillBookingStockAction
} from "@/app/actions";
import { getProductThumbnailUrl } from "@/lib/s3";
import { ShimmerImage } from "@/components/Skeleton";

interface BookingItem {
  id: string;
  productId: string;
  requestedQuantity: number;
  approvedQuantity: number;
  reservedQuantity: number;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  cancelledQuantity: number;
  unit: string;
  remarks: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    size: string;
    brandName: string;
    availableStock: number;
    image_key?: string | null;
    thumbnail_key?: string | null;
    lifestyleImage?: string | null;
    textureImage?: string | null;
  };
}

interface Booking {
  id: string;
  bookingNumber: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  releasedAt: string | null;
  notes: string | null;
  priority: string;
  extensionRequested: boolean;
  extensionHours: number | null;
  extensionReason: string | null;
  dealer: { id: string; name: string; company: string | null; email: string | null; phone: string | null };
  warehouse: { id: string; name: string; code: string };
  items: BookingItem[];
}

interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  details: string;
  createdAt: string;
}

interface Props {
  booking: Booking;
  auditLogs: AuditLog[];
  session: SessionContext;
}

export function BookingDetailClient({ booking, auditLogs, session }: Props) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  // Expiry countdown timer
  const [timeLeft, setTimeLeft] = useState<string>("");
  useEffect(() => {
    if (booking.status !== "AWAITING_DEALER_CONFIRMATION" || !booking.expiresAt) return;

    const updateTimer = () => {
      const diffMs = new Date(booking.expiresAt!).getTime() - new Date().getTime();
      if (diffMs <= 0) {
        setTimeLeft("Expired");
        router.refresh();
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      setTimeLeft(`${hours}h ${mins}m ${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [booking.expiresAt, booking.status, router]);

  // Approval override quantities (for Partial Approval)
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, number>>(
    booking.items.reduce((acc, item) => ({ ...acc, [item.id]: item.requestedQuantity }), {})
  );
  const [reviewNote, setReviewNote] = useState("");
  
  // Extension & Cancellation modal/fields
  const [extensionReason, setExtensionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);

  const handleQtyChange = (itemId: string, val: number) => {
    if (val < 0) return;
    setApprovedQuantities({ ...approvedQuantities, [itemId]: val });
  };

  const executeAction = async (actionName: string, promise: Promise<any>) => {
    setLoadingAction(actionName);
    try {
      await promise;
      router.refresh();
      setShowExtensionForm(false);
      setShowCancelForm(false);
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManagerReview = async (status: "APPROVED" | "REJECTED" | "ON_HOLD") => {
    const itemApprovals = booking.items.map((i) => ({
      itemId: i.id,
      approvedQuantity: approvedQuantities[i.id],
    }));

    executeAction(
      `review-${status}`,
      reviewBookingAction(booking.id, status, `Manager`, itemApprovals, reviewNote)
    );
  };

  const handleConfirm = async () => {
    executeAction(`confirm`, confirmBookingAction(booking.id, `Dealer User`));
  };

  const handleRequestExtension = async () => {
    if (!extensionReason) {
      alert("Please enter a reason for the extension.");
      return;
    }
    executeAction(
      `request-extension`,
      requestBookingExtensionAction(booking.id, 24, extensionReason, `Dealer User`)
    );
  };

  const handleReviewExtension = async (action: "APPROVE" | "REJECT") => {
    executeAction(`extension-${action}`, reviewExtensionAction(booking.id, action, `Manager`));
  };

  const handleCancel = async () => {
    if (!cancelReason && booking.status === "CONFIRMED") {
      alert("Please provide a reason for the cancellation request.");
      return;
    }
    executeAction(
      `cancel`,
      cancelBookingAction(booking.id, session.role === "DEALER" ? `Dealer` : `Manager`, cancelReason || "Cancelled by user")
    );
  };

  const handleAllocate = async () => {
    executeAction(`allocate`, allocateBookingStockAction(booking.id, `Manager`));
  };

  const handleFulfill = async () => {
    executeAction(`fulfill`, fulfillBookingStockAction(booking.id, `Manager`));
  };

  const handlePrint = () => {
    window.print();
  };

  const getTimelineSteps = () => {
    const steps = [
      { name: "Draft", completed: true },
      { name: "Requested", completed: true },
      { name: "Approved", completed: ["APPROVED", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED", "ALLOCATED", "FULFILLED"].includes(booking.status) },
      { name: "Confirmed", completed: ["CONFIRMED", "ALLOCATED", "FULFILLED"].includes(booking.status) },
      { name: "Allocated", completed: ["ALLOCATED", "FULFILLED"].includes(booking.status) },
      { name: "Fulfilled", completed: booking.status === "FULFILLED" },
    ];
    if (booking.status === "REJECTED") {
      steps[2] = { name: "Rejected", completed: true };
    }
    if (booking.status === "CANCELLED") {
      steps[3] = { name: "Cancelled", completed: true };
    }
    if (booking.status === "EXPIRED") {
      steps[3] = { name: "Expired", completed: true };
    }
    return steps;
  };

  const timelineSteps = getTimelineSteps();
  const isReadOnly = session.role === "VIEWER";

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/bookings"
            className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-[#6B6B6B] hover:text-[#111111] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[#111111] font-mono">{booking.bookingNumber}</h1>
              <span className="rounded-full bg-[#F7F7F5] border border-[#EAEAEA] px-2.5 py-0.5 text-[9px] font-bold text-[#6B6B6B] uppercase">
                {booking.priority}
              </span>
              <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[9px] font-bold text-blue-700 uppercase">
                {booking.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-[10px] text-[#6B6B6B] mt-1">
              Created on {new Date(booking.requestedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-bold text-[#111111] hover:bg-[#F7F7F5] transition-all"
          >
            <Download className="h-4 w-4" /> Print Slip
          </button>
        </div>
      </div>

      {/* READ-ONLY DISCLAIMER */}
      {isReadOnly && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-600" />
          <span>You are viewing this reservation details in read-only audit mode. Access is restricted.</span>
        </div>
      )}

      {/* TIMELINE PROGRESS */}
      <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
        <h3 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-4">Reservation Timeline</h3>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
          {timelineSteps.map((step, idx) => (
            <React.Fragment key={idx}>
              <div className="flex items-center gap-2.5 z-10">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    step.completed
                      ? "bg-[#F2C202] text-white font-black shadow-xs"
                      : "border border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]"
                  }`}
                >
                  {step.completed ? "✓" : idx + 1}
                </div>
                <span className={`text-xs font-bold ${step.completed ? "text-[#111111]" : "text-[#6B6B6B]"}`}>
                  {step.name}
                </span>
              </div>
              {idx < timelineSteps.length - 1 && (
                <div
                  className={`hidden md:block h-0.5 flex-1 mx-4 transition-all duration-300 ${
                    timelineSteps[idx + 1].completed ? "bg-[#F2C202]" : "bg-[#EAEAEA]"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* THREE COLUMNS GRID */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* DETAILS COLUMN (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* INFO CARD */}
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-[#F2C202]" /> Dealer Client
              </span>
              <p className="text-xs font-bold text-[#111111] mt-1.5">{booking.dealer.name}</p>
              <p className="text-[10px] text-[#6B6B6B]">{booking.dealer.company || "No Company Info"}</p>
              <p className="text-[10px] text-[#6B6B6B]">{booking.dealer.email} • {booking.dealer.phone}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#F2C202]" /> Source Depot
              </span>
              <p className="text-xs font-bold text-[#111111] mt-1.5">{booking.warehouse.name}</p>
              <p className="text-[10px] text-[#6B6B6B] font-mono">Code: {booking.warehouse.code}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[#F2C202]" /> Reservation Timer
              </span>
              {booking.status === "AWAITING_DEALER_CONFIRMATION" ? (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs font-black text-amber-600 animate-pulse flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {timeLeft}
                  </p>
                  <p className="text-[9px] text-[#6B6B6B]">Expires {new Date(booking.expiresAt!).toLocaleString()}</p>
                </div>
              ) : (
                <p className="text-xs text-[#6B6B6B] font-semibold mt-1.5">
                  {booking.status === "EXPIRED" ? "Expired & Released" : "No Expiry Active"}
                </p>
              )}
            </div>
          </div>

          {/* PRODUCTS LIST */}
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Reserved Item Specifications</h3>
            
            <div className="space-y-3">
              {booking.items.map((item) => {
                const showQtyAdjustment = 
                  (booking.status === "PENDING_APPROVAL" || booking.status === "ON_HOLD") && 
                  session.role !== "DEALER" && 
                  !isReadOnly;

                return (
                  <div key={item.id} className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5]/50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="flex gap-3">
                        <ShimmerImage
                          src={getProductThumbnailUrl(item.product)}
                          alt={item.product.name}
                          wrapperClassName="h-12 w-12 relative overflow-hidden rounded-lg border border-[#EAEAEA] shrink-0"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-[#111111]">{item.product.name}</h4>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[10px] text-[#6B6B6B] mt-1">
                            <span>SKU: <strong className="font-mono text-[#111111]">{item.product.sku}</strong></span>
                            <span>Size: <strong>{item.product.size}</strong></span>
                            <span>Warehouse Stock: <strong className="text-emerald-600">{item.product.availableStock} Box</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Display quantities */}
                      <div className="flex flex-wrap gap-4 text-right sm:text-left text-xs bg-white rounded-lg p-2.5 border border-[#EAEAEA]">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Requested</p>
                          <p className="font-bold text-[#111111] mt-0.5">{item.requestedQuantity} {item.unit}</p>
                        </div>
                        {booking.status !== "PENDING_APPROVAL" && (
                          <div>
                            <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Approved</p>
                            <p className="font-bold text-amber-600 mt-0.5">{item.approvedQuantity} {item.unit}</p>
                          </div>
                        )}
                        {item.allocatedQuantity > 0 && (
                          <div>
                            <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Allocated</p>
                            <p className="font-bold text-cyan-600 mt-0.5">{item.allocatedQuantity} {item.unit}</p>
                          </div>
                        )}
                        {item.fulfilledQuantity > 0 && (
                          <div>
                            <p className="text-[9px] uppercase font-bold text-[#6B6B6B]">Fulfilled</p>
                            <p className="font-bold text-emerald-600 mt-0.5">{item.fulfilledQuantity} {item.unit}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity Adjustment form for Manager Review */}
                    {showQtyAdjustment && (
                      <div className="flex items-center gap-4 bg-white p-2.5 rounded-lg border border-[#EAEAEA]">
                        <span className="text-[10px] font-bold text-[#6B6B6B] uppercase">Approve Quantity:</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={item.product.availableStock}
                            value={approvedQuantities[item.id]}
                            onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 rounded bg-[#F7F7F5] border border-[#EAEAEA] p-1 text-center text-xs font-bold text-[#111111] focus:outline-hidden"
                          />
                          <span className="text-[10px] text-[#6B6B6B]">Boxes</span>
                        </div>
                        {approvedQuantities[item.id] > item.product.availableStock && (
                          <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Exceeds Stock!
                          </span>
                        )}
                      </div>
                    )}

                    {item.remarks && (
                      <p className="text-[10px] italic text-[#6B6B6B]">
                        Remarks: "{item.remarks}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ACTIONS & AUDIT COLUMN (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* ACTIVE ACTIONS PANEL */}
          {!isReadOnly && (
            <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#F2C202]" />
                <span>Control Actions</span>
              </h3>

              {/* MANAGER APPROVAL CONTROLS */}
              {session.role !== "DEALER" && (
                <div className="space-y-3">
                  {/* Extension Requests Review */}
                  {booking.extensionRequested && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-1.5 text-xs font-bold text-amber-800">
                        <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                        <span>Extension Requested (+{booking.extensionHours}h)</span>
                      </div>
                      <p className="text-[10px] text-amber-900 italic">"{booking.extensionReason}"</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewExtension("APPROVE")}
                          disabled={loadingAction !== null}
                          className="w-full rounded bg-emerald-600 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                        >
                          Approve Extension
                        </button>
                        <button
                          onClick={() => handleReviewExtension("REJECT")}
                          disabled={loadingAction !== null}
                          className="w-full rounded bg-white border border-[#EAEAEA] py-1 text-[10px] font-bold text-[#6B6B6B] hover:bg-[#F7F7F5]"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pending Approval Controls */}
                  {(booking.status === "PENDING_APPROVAL" || booking.status === "ON_HOLD") && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#6B6B6B] uppercase">Review Notes / Remarks</label>
                        <textarea
                          placeholder="Type notes for dealer..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={2}
                          className="w-full rounded bg-[#F7F7F5] border border-[#EAEAEA] p-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                        />
                      </div>
                      <button
                        onClick={() => handleManagerReview("APPROVED")}
                        disabled={loadingAction !== null}
                        className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="h-4 w-4" /> Approve Reservation
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleManagerReview("REJECTED")}
                          disabled={loadingAction !== null}
                          className="rounded-lg bg-rose-50 border border-rose-200 py-2 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => handleManagerReview("ON_HOLD")}
                          disabled={loadingAction !== null}
                          className="rounded-lg bg-[#F7F7F5] border border-[#EAEAEA] py-2 text-xs font-bold text-[#6B6B6B] hover:bg-[#EAEAEA] transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          Hold Request
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmed -> Allocate */}
                  {booking.status === "CONFIRMED" && (
                    <button
                      onClick={handleAllocate}
                      disabled={loadingAction !== null}
                      className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" /> Allocate Stock for Dispatch
                    </button>
                  )}

                  {/* Allocated -> Fulfill */}
                  {booking.status === "ALLOCATED" && (
                    <button
                      onClick={handleFulfill}
                      disabled={loadingAction !== null}
                      className="w-full rounded-lg bg-[#F2C202] py-2.5 text-xs font-bold text-white hover:bg-[#D8AD02] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="h-4 w-4" /> Fulfill / Dispatch Stock Out
                    </button>
                  )}

                  {/* General Cancel button for manager */}
                  {["PENDING_APPROVAL", "ON_HOLD", "APPROVED", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED"].includes(booking.status) && (
                    <div className="pt-2 border-t border-[#EAEAEA]">
                      {!showCancelForm ? (
                        <button
                          onClick={() => setShowCancelForm(true)}
                          className="w-full rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 py-1.5 text-[10.5px] font-bold transition-all cursor-pointer"
                        >
                          Force Cancel Reservation
                        </button>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            placeholder="Cancellation reason..."
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-full rounded bg-[#F7F7F5] border border-[#EAEAEA] p-1.5 text-xs text-[#111111] focus:outline-hidden"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleCancel}
                              className="w-full rounded bg-rose-600 py-1 text-[10px] font-bold text-white hover:bg-rose-500"
                            >
                              Confirm Cancel
                            </button>
                            <button
                              onClick={() => setShowCancelForm(false)}
                              className="w-full rounded bg-[#F7F7F5] border border-[#EAEAEA] py-1 text-[10px] font-bold text-[#6B6B6B]"
                            >
                              Abort
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DEALER ACTIONS PORTAL */}
              {session.role === "DEALER" && (
                <div className="space-y-3">
                  {/* Confirm Booking Hold */}
                  {booking.status === "AWAITING_DEALER_CONFIRMATION" && (
                    <div className="space-y-2">
                      <button
                        onClick={handleConfirm}
                        disabled={loadingAction !== null}
                        className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="h-4 w-4" /> Confirm Booking Hold
                      </button>

                      {/* Request Extension form */}
                      {!showExtensionForm ? (
                        <button
                          onClick={() => setShowExtensionForm(true)}
                          className="w-full rounded-lg border border-[#EAEAEA] bg-white py-1.5 text-[10.5px] font-semibold text-[#6B6B6B] hover:bg-[#F7F7F5] cursor-pointer"
                        >
                          Request Expiry Extension
                        </button>
                      ) : (
                        <div className="rounded-lg bg-[#F7F7F5] p-2.5 border border-[#EAEAEA] space-y-2">
                          <label className="text-[9px] uppercase font-bold text-[#6B6B6B]">Extension Reason</label>
                          <input
                            type="text"
                            placeholder="Reason (e.g. Awaiting client site clearance)..."
                            value={extensionReason}
                            onChange={(e) => setExtensionReason(e.target.value)}
                            className="w-full rounded border border-[#EAEAEA] bg-white p-1.5 text-xs text-[#111111] focus:outline-hidden"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleRequestExtension}
                              className="w-full rounded bg-[#F2C202] py-1 text-[10px] font-bold text-white hover:bg-[#D8AD02]"
                            >
                              Send Request
                            </button>
                            <button
                              onClick={() => setShowExtensionForm(false)}
                              className="w-full rounded bg-white border border-[#EAEAEA] py-1 text-[10px] font-bold text-[#6B6B6B]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cancel Hold */}
                  {["PENDING_APPROVAL", "ON_HOLD", "APPROVED", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED"].includes(booking.status) && (
                    <button
                      onClick={handleCancel}
                      disabled={loadingAction !== null}
                      className="w-full rounded-lg border border-rose-200 bg-rose-50 text-rose-700 py-2 text-xs font-bold hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                    >
                      Release / Cancel Hold
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AUDIT TIMELINE LOGS */}
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Audit logs</h3>
            <div className="relative border-l border-[#EAEAEA] ml-3 pl-5 space-y-4 max-h-[300px] overflow-y-auto">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-[#6B6B6B]/60 italic">No logs recorded yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="relative text-xs space-y-1">
                    <span className="absolute -left-[27.5px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white border border-[#EAEAEA] text-[7px] text-[#6B6B6B]">
                      ●
                    </span>
                    <p className="font-bold text-[#111111]">{log.details}</p>
                    <p className="text-[10px] text-[#6B6B6B]">
                      {log.performedBy} • {new Date(log.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
