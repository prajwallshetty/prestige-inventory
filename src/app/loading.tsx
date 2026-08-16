import React from "react";
import { InventorySkeleton } from "@/components/layout/Skeletons";

export default function Loading() {
  return (
    <div className="w-full max-w-[1600px] mx-auto">
      <InventorySkeleton />
    </div>
  );
}
