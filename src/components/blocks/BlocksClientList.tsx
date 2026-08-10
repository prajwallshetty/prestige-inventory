"use client";

import React from "react";
import { approveBlockAction, releaseBlockAction } from "@/app/actions";
import { Check, X, Clock, AlertTriangle } from "lucide-react";

export function BlocksClientList({ blocks }: { blocks: any[] }) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Block ID</th>
              <th className="px-4 py-3.5">Product SKU</th>
              <th className="px-4 py-3.5">Dealer / Requested By</th>
              <th className="px-4 py-3.5 text-right">Quantity</th>
              <th className="px-4 py-3.5">Requested Date</th>
              <th className="px-4 py-3.5">Expires In</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                  No stock reservations found matching this filter.
                </td>
              </tr>
            ) : (
              blocks.map((block) => (
                <tr key={block.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{block.id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-3 font-bold text-white">
                    {block.inventory?.product?.sku || block.inventory?.product?.name || "Tile"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-200">{block.dealer?.name || block.requestedBy}</p>
                    {block.remarks && <p className="text-[10px] italic text-slate-400">"{block.remarks}"</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-amber-400">{block.quantity} Boxes</td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(block.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <TimeRemainingBadge expiresAt={block.expiresAt} status={block.status} />
                  </td>
                  <td className="px-4 py-3">
                    <BlockStatusBadge status={block.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {block.status === "PENDING" && (
                        <button
                          onClick={async () => await approveBlockAction(block.id)}
                          className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                      )}
                      {(block.status === "APPROVED" || block.status === "PENDING") && (
                        <button
                          onClick={async () => await releaseBlockAction(block.id, "Manager manual release")}
                          className="flex items-center gap-1 rounded bg-rose-600/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 text-[10px] font-semibold hover:bg-rose-600 hover:text-white"
                        >
                          <X className="h-3 w-3" /> Release
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlockStatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    EXPIRED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    RELEASED: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeMap[status] || badgeMap.PENDING}`}>
      {status}
    </span>
  );
}

function TimeRemainingBadge({ expiresAt, status }: { expiresAt?: string; status: string }) {
  if (status !== "APPROVED" && status !== "PENDING") {
    return <span className="text-[10px] text-slate-500">—</span>;
  }

  if (!expiresAt) return <span className="text-[10px] text-slate-400">No Expiry</span>;

  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-400">Expired</span>;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400">
      <Clock className="h-3 w-3" />
      {hours}h {mins}m
    </span>
  );
}
