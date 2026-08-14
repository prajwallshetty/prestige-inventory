import React from "react";

export default function Loading() {
  return (
    <div className="flex h-[60vh] w-full items-center justify-center font-sans select-none">
      <div className="space-y-3.5 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#F2C202] border-t-transparent" />
        <p className="text-[10px] font-black uppercase tracking-widest text-[#6B6B6B]">
          Fetching Prestige Data...
        </p>
      </div>
    </div>
  );
}
