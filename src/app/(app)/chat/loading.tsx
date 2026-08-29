import React from "react";
import { MessageSquare } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100dvh-64px)] md:h-[calc(100vh-120px)] md:min-h-[560px] w-full overflow-hidden rounded-none md:rounded-2xl border-0 md:border md:border-[#EAEAEA] bg-white text-[#111111] md:shadow-sm">
      {/* LEFT PANEL: Conversation List Skeleton */}
      <div className="flex w-full flex-col border-r border-[#EAEAEA] bg-white md:w-80 md:min-w-[320px] lg:w-96">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAEAEA] p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#F2C202]" />
            <div className="h-5 w-28 bg-[#EAEAEA] rounded-md animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-9 w-9 bg-[#EAEAEA] rounded-xl animate-pulse" />
            <div className="h-9 w-9 bg-[#EAEAEA] rounded-xl animate-pulse" />
          </div>
        </div>

        {/* Search */}
        <div className="p-3 space-y-2 border-b border-[#EAEAEA]">
          <div className="h-9 w-full bg-[#F7F7F5] rounded-xl animate-pulse" />
          <div className="flex gap-1">
            <div className="h-6 w-12 bg-[#EAEAEA] rounded-lg animate-pulse" />
            <div className="h-6 w-16 bg-[#EAEAEA] rounded-lg animate-pulse" />
            <div className="h-6 w-16 bg-[#EAEAEA] rounded-lg animate-pulse" />
          </div>
        </div>

        {/* List items */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#EAEAEA]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-3.5 flex items-center justify-between min-h-[64px]">
              <div className="flex items-center gap-3 w-full">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-[#EAEAEA] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3.5 w-28 bg-[#EAEAEA] rounded animate-pulse" />
                    <div className="h-3 w-10 bg-[#F7F7F5] rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-40 bg-[#F7F7F5] rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: Thread Skeleton */}
      <div className="hidden md:flex flex-1 flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#EAEAEA] animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-[#EAEAEA] rounded animate-pulse" />
              <div className="h-3 w-20 bg-[#F7F7F5] rounded animate-pulse" />
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 bg-[#F7F7F5]/40">
          <div className="h-14 w-2/3 bg-[#EAEAEA]/70 rounded-2xl animate-pulse" />
          <div className="h-14 w-1/2 bg-[#FEF6D8]/60 border border-[#F2C202]/30 rounded-2xl animate-pulse ml-auto" />
          <div className="h-16 w-3/4 bg-[#EAEAEA]/70 rounded-2xl animate-pulse" />
          <div className="h-10 w-1/3 bg-[#FEF6D8]/60 border border-[#F2C202]/30 rounded-2xl animate-pulse ml-auto" />
        </div>

        <div className="border-t border-[#EAEAEA] p-3">
          <div className="h-11 w-full bg-[#F7F7F5] rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
