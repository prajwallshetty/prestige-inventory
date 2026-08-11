"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050811] px-4 text-center">
      <div className="max-w-md space-y-6 rounded-2xl border border-slate-800 bg-[#0c1122]/80 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
          <WifiOff className="h-8 w-8" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white tracking-tight">You are offline</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            We are unable to connect to the Prestige Tiles master database. Critical stock updates and reservations require an active internet connection.
          </p>
        </div>

        <button
          onClick={handleRetry}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-black text-slate-950 hover:bg-amber-400 transition-all shadow-lg hover:shadow-amber-500/10"
        >
          <RefreshCw className="h-4 w-4" /> Try Reconnecting
        </button>
      </div>
    </div>
  );
}
