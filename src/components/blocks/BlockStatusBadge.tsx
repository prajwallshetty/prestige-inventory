"use client";

import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * One badge definition shared by the list, the detail page and the dashboards,
 * so a status never looks like two different things in two places.
 */
const STATUS_STYLES: Record<string, { className: string; label: string }> = {
  PENDING_INCHARGE_APPROVAL: {
    className: "border-orange-200 bg-orange-50 text-orange-800",
    label: "Pending In-Charge",
  },
  PENDING_MANAGER_APPROVAL: {
    className: "border-amber-200 bg-amber-50 text-amber-800",
    label: "Pending Manager",
  },
  APPROVED: { className: "border-emerald-200 bg-emerald-50 text-emerald-800", label: "Approved" },
  READY_TO_SHIP: { className: "border-indigo-200 bg-indigo-50 text-indigo-800", label: "Ready to Ship" },
  SHIPPED: { className: "border-blue-200 bg-blue-50 text-blue-800", label: "Shipped" },
  PARTIALLY_SHIPPED: { className: "border-sky-200 bg-sky-50 text-sky-800", label: "Partially Shipped" },
  DELIVERED: { className: "border-purple-200 bg-purple-50 text-purple-800", label: "Delivered" },
  PARTIALLY_DELIVERED: {
    className: "border-violet-200 bg-violet-50 text-violet-800",
    label: "Partially Delivered",
  },
  REJECTED: { className: "border-rose-200 bg-rose-50 text-rose-800", label: "Rejected" },
  CANCELLED: { className: "border-rose-200 bg-rose-50 text-rose-800", label: "Cancelled" },
  EXPIRED: { className: "border-rose-200 bg-rose-50 text-rose-800", label: "Expired" },
  RELEASED: { className: "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]", label: "Released" },
};

/** Statuses where the reservation is still counting down. */
const LIVE_STATUSES = [
  "PENDING_INCHARGE_APPROVAL",
  "PENDING_MANAGER_APPROVAL",
  "APPROVED",
  "READY_TO_SHIP",
];

export function BlockStatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const style = STATUS_STYLES[status] ?? {
    className: "border-[#EAEAEA] bg-[#F7F7F5] text-[#6B6B6B]",
    label: status.replace(/_/g, " "),
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold uppercase tracking-wide ${style.className} ${
        size === "md" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[9.5px]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  );
}

/**
 * Time remaining on a hold.
 *
 * Rendered client-side after mount: the countdown is relative to *now*, and
 * server-rendering it produces a value that is already wrong by the time it
 * reaches the browser (and mismatches on hydration).
 */
export function ExpiryBadge({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!LIVE_STATUSES.includes(status)) {
    return <span className="text-[10px] text-[#6B6B6B]">—</span>;
  }
  if (!expiresAt) return <span className="text-[10px] text-[#6B6B6B]">No expiry</span>;
  if (now === null) {
    return <span className="text-[10px] text-[#6B6B6B]">—</span>;
  }

  const diffMs = new Date(expiresAt).getTime() - now;
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-700">Expired</span>;
  }

  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  const urgent = diffMs < 2 * 3_600_000;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold ${
        urgent ? "text-rose-700" : "text-[#8A7300]"
      }`}
      title={new Date(expiresAt).toLocaleString("en-IN")}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {hours > 48 ? `${Math.floor(hours / 24)}d` : `${hours}h ${mins}m`}
    </span>
  );
}
