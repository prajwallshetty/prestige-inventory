"use client";

import React, { useState } from "react";
import { approveBlockAction, releaseBlockAction } from "@/app/actions";
import { Check, X, Clock, AlertTriangle, ShieldCheck, HelpCircle } from "lucide-react";

export function BlocksClientList({ blocks }: { blocks: any[] }) {
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleApprove = async (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await approveBlockAction(id);
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleRelease = async (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await releaseBlockAction(id, "Manager manual release");
    } catch (err: any) {
      alert(`Release failed: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-850 bg-[#0c1122] shadow-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#1b253b]/65 bg-[#080c16] text-[10px] font-black uppercase text-slate-450 tracking-wider">
            <tr>
              <th className="px-4 py-4 font-mono">Block ID</th>
              <th className="px-4 py-4">Product SKU</th>
              <th className="px-4 py-4">Dealer / Requestor</th>
              <th className="px-4 py-4 text-right">Quantity</th>
              <th className="px-4 py-4">Requested Date</th>
              <th className="px-4 py-4">Time Remaining</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1b253b]/35 font-medium text-slate-200">
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-slate-550 italic">
                  No stock reservations found matching this filter.
                </td>
              </tr>
            ) : (
              blocks.map((block) => (
                <tr key={block.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-[10.5px] text-slate-450">#{block.id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-3.5 font-bold text-white">
                    {block.inventory?.product?.sku || block.inventory?.product?.name || "Tile SKU"}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-white">{block.dealer?.name || block.requestedBy}</p>
                    {block.remarks && <p className="text-[10px] text-slate-450 italic mt-0.5">"{block.remarks}"</p>}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-amber-500 font-mono">{block.quantity} Box</td>
                  <td className="px-4 py-3.5 text-slate-400">
                    {new Date(block.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3.5">
                    <TimeRemainingBadge expiresAt={block.expiresAt} status={block.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <BlockStatusBadge status={block.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      {block.status === "PENDING" && (
                        <button
                          onClick={() => handleApprove(block.id)}
                          disabled={loadingMap[block.id]}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white hover:bg-emerald-500 transition-all touch-target"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                      )}
                      {(block.status === "APPROVED" || block.status === "PENDING") && (
                        <button
                          onClick={() => handleRelease(block.id)}
                          disabled={loadingMap[block.id]}
                          className="flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-black text-rose-455 hover:bg-rose-650 hover:text-white transition-all touch-target"
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

      {/* MOBILE LIST CARDS */}
      <div className="md:hidden space-y-3">
        {blocks.length === 0 ? (
          <div className="rounded-xl border border-slate-850 bg-[#0c1122] p-8 text-center text-xs text-slate-500 italic">
            No stock reservations found.
          </div>
        ) : (
          blocks.map((block) => (
            <div 
              key={block.id} 
              className="rounded-xl border border-slate-855 bg-[#0c1122] p-4 shadow-md space-y-3.5"
            >
              {/* Header: ID, Status */}
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] font-bold text-slate-450">
                  #{block.id.slice(-8).toUpperCase()}
                </span>
                <BlockStatusBadge status={block.status} />
              </div>

              {/* Info grid */}
              <div className="space-y-1">
                <h4 className="text-xs font-black text-white">
                  {block.inventory?.product?.sku || "Tile Product"}
                </h4>
                <p className="text-[10px] text-slate-450">
                  Dealer: <strong className="text-slate-300">{block.dealer?.name || block.requestedBy}</strong>
                </p>
                {block.remarks && (
                  <p className="text-[10px] text-slate-400 italic">
                    "{block.remarks}"
                  </p>
                )}
              </div>

              {/* Details card */}
              <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-850 bg-slate-950/40 rounded-lg text-center text-xs">
                <div>
                  <p className="text-[8.5px] uppercase font-bold text-slate-500">Quantity</p>
                  <p className="font-black text-amber-500 mt-0.5">{block.quantity} Box</p>
                </div>
                <div>
                  <p className="text-[8.5px] uppercase font-bold text-slate-500">Remaining</p>
                  <div className="mt-0.5 flex justify-center">
                    <TimeRemainingBadge expiresAt={block.expiresAt} status={block.status} />
                  </div>
                </div>
              </div>

              {/* Actions row */}
              {((block.status === "PENDING") || (block.status === "APPROVED")) && (
                <div className="flex gap-2">
                  {block.status === "PENDING" && (
                    <button
                      onClick={() => handleApprove(block.id)}
                      disabled={loadingMap[block.id]}
                      className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-1 touch-target"
                    >
                      <Check className="h-4 w-4" /> Approve
                    </button>
                  )}
                  <button
                    onClick={() => handleRelease(block.id)}
                    disabled={loadingMap[block.id]}
                    className="w-full rounded-lg border border-rose-500/25 bg-rose-500/5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-650 hover:text-white transition-all flex items-center justify-center gap-1 touch-target"
                  >
                    <X className="h-4 w-4" /> Release
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BlockStatusBadge({ status }: { status: string }) {
  const badgeMap: any = {
    PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    EXPIRED: "bg-rose-500/10 text-rose-455 border-rose-500/20",
    RELEASED: "bg-slate-500/10 text-slate-450 border-slate-500/20",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${badgeMap[status] || badgeMap.PENDING}`}>
      <span className="h-1 w-1 rounded-full bg-current"></span>
      {status}
    </span>
  );
}

function TimeRemainingBadge({ expiresAt, status }: { expiresAt?: string; status: string }) {
  if (status !== "APPROVED" && status !== "PENDING") {
    return <span className="text-[10px] text-slate-500">—</span>;
  }

  if (!expiresAt) return <span className="text-[10px] text-slate-450">No Expiry</span>;

  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (diffMs <= 0) {
    return <span className="text-[10px] font-bold text-rose-455">Expired</span>;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-amber-500">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{hours}h {mins}m</span>
    </span>
  );
}
