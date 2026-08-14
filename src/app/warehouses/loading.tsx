"use client";

import React from "react";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { CardSkeleton } from "@/components/Skeleton";

export default function WarehousesLoading() {
  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="h-8 w-64 bg-[#EAEAEA] rounded-md animate-pulse" />
        <div className="h-4 w-96 bg-[#EAEAEA] rounded-md animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </SidebarLayout>
  );
}
