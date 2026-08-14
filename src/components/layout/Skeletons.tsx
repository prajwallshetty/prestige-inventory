import React from "react";

// Reusable shimmer block
export function Shimmer({ className = "h-4 rounded-md bg-[#EAEAEA] animate-pulse" }: { className?: string }) {
  return <div className={className} />;
}

// 1. Dashboard Loading State
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 font-sans w-full">
      {/* Top Header Shimmer */}
      <div className="space-y-2">
        <Shimmer className="h-6 w-48 rounded-md bg-[#EAEAEA] animate-pulse" />
        <Shimmer className="h-3 w-72 rounded-md bg-[#EAEAEA] animate-pulse" />
      </div>

      {/* Metric Cards Shimmer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-3">
            <div className="flex justify-between items-center">
              <Shimmer className="h-3 w-20 rounded-md bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-6 w-6 rounded-full bg-[#EAEAEA] animate-pulse" />
            </div>
            <Shimmer className="h-7 w-28 rounded-md bg-[#EAEAEA] animate-pulse" />
            <Shimmer className="h-3.5 w-32 rounded-md bg-[#EAEAEA] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Grid columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main section */}
        <div className="lg:col-span-2 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-[#EAEAEA]">
            <Shimmer className="h-4 w-36 rounded-md bg-[#EAEAEA] animate-pulse" />
            <Shimmer className="h-3 w-16 rounded-md bg-[#EAEAEA] animate-pulse" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <Shimmer className="h-10 w-10 rounded-lg bg-[#EAEAEA] animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <Shimmer className="h-3 w-1/3 rounded-md bg-[#EAEAEA] animate-pulse" />
                  <Shimmer className="h-2.5 w-1/2 rounded-md bg-[#EAEAEA] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar section */}
        <div className="lg:col-span-1 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
          <Shimmer className="h-4 w-28 rounded-md bg-[#EAEAEA] animate-pulse pb-1 border-b border-[#EAEAEA]" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[#EAEAEA] p-3.5 space-y-2">
                <Shimmer className="h-3 w-2/3 rounded-md bg-[#EAEAEA] animate-pulse" />
                <Shimmer className="h-2.5 w-full rounded-md bg-[#EAEAEA] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. Inventory / Table Loading State
export function InventorySkeleton() {
  return (
    <div className="space-y-6 font-sans w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-1.5">
          <Shimmer className="h-5 w-40 rounded-md bg-[#EAEAEA] animate-pulse" />
          <Shimmer className="h-3 w-64 rounded-md bg-[#EAEAEA] animate-pulse" />
        </div>
        <Shimmer className="h-9 w-32 rounded-lg bg-[#EAEAEA] animate-pulse" />
      </div>

      <div className="rounded-2xl border border-[#EAEAEA] bg-white overflow-hidden">
        <div className="p-4 bg-[#F7F7F5] border-b border-[#EAEAEA] flex gap-3">
          <Shimmer className="h-8 w-48 rounded-lg bg-[#EAEAEA] animate-pulse" />
          <Shimmer className="h-8 w-24 rounded-lg bg-[#EAEAEA] animate-pulse" />
        </div>
        
        <div className="divide-y divide-[#EAEAEA]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4 grid grid-cols-6 gap-4 items-center">
              <Shimmer className="h-3 w-2/3 rounded-md bg-[#EAEAEA] animate-pulse col-span-2" />
              <Shimmer className="h-3 w-1/2 rounded-md bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-3 w-1/3 rounded-md bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-3 w-1/4 rounded-md bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-6 w-16 rounded-md bg-[#EAEAEA] animate-pulse justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. Booking / Block Loading State
export function BookingSkeleton() {
  return (
    <div className="space-y-6 font-sans w-full">
      <div className="space-y-1">
        <Shimmer className="h-5 w-44 rounded-md bg-[#EAEAEA] animate-pulse" />
        <Shimmer className="h-3 w-60 rounded-md bg-[#EAEAEA] animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4 shadow-xs">
            <div className="flex justify-between items-start border-b border-[#EAEAEA] pb-2">
              <div className="space-y-1">
                <Shimmer className="h-3.5 w-32 rounded-md bg-[#EAEAEA] animate-pulse" />
                <Shimmer className="h-2.5 w-24 rounded-md bg-[#EAEAEA] animate-pulse" />
              </div>
              <Shimmer className="h-5 w-16 rounded-full bg-[#EAEAEA] animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <Shimmer className="h-3 w-5/6 rounded-md bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-3 w-2/3 rounded-md bg-[#EAEAEA] animate-pulse" />
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#F7F7F5] justify-end">
              <Shimmer className="h-7 w-20 rounded-lg bg-[#EAEAEA] animate-pulse" />
              <Shimmer className="h-7 w-24 rounded-lg bg-[#EAEAEA] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
