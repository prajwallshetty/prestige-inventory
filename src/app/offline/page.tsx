"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F5] px-4 text-center font-sans antialiased text-[#111111]">
      <div className="max-w-md space-y-6 rounded-2xl border border-[#EAEAEA] bg-white p-8 shadow-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
          <WifiOff className="h-8 w-8" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-black text-[#111111] tracking-tight">You are offline</h1>
          <p className="text-xs text-[#6B6B6B] leading-relaxed">
            We are unable to connect to the Prestige Tiles master database. Critical stock updates and reservations require an active internet connection.
          </p>
        </div>

        <button
          onClick={handleRetry}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F2C202] py-3 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-sm cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" /> Try Reconnecting
        </button>
      </div>
    </div>
  );
}
