import { Skeleton, TableSkeleton } from "@/components/ui/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6 font-sans">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
