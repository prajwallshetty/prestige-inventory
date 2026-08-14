"use client";

import React from "react";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { TableSkeleton } from "@/components/Skeleton";

export default function InTransitLoading() {
  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="h-8 w-64 bg-[#EAEAEA] rounded-md animate-pulse" />
        <div className="h-4 w-96 bg-[#EAEAEA] rounded-md animate-pulse" />
        <TableSkeleton rows={4} cols={6} />
      </div>
    </SidebarLayout>
  );
}
