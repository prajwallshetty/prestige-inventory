import React, { useState, useEffect } from "react";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-shimmer rounded-md bg-[#F0F0EE] ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 space-y-4 shadow-sm">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
      <div className="border-b border-[#EAEAEA] bg-[#F7F7F5] p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[#EAEAEA] p-4 space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 items-center py-1">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImageSkeleton({ className = "h-40 w-full" }: { className?: string }) {
  return <Skeleton className={`${className} rounded-lg`} />;
}

export function ShimmerImage({
  src,
  alt,
  className = "object-cover",
  wrapperClassName = "h-40 w-full relative overflow-hidden rounded-lg",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setError(true);
    } else {
      setError(false);
      setLoaded(false);
    }
  }, [src]);

  if (error || !src) {
    return (
      <div className={`${wrapperClassName} bg-[#F7F7F5] border border-[#EAEAEA] flex items-center justify-center text-center p-4`}>
        <span className="text-[10px] font-medium text-[#6B6B6B] uppercase tracking-wider">[ Product image unavailable ]</span>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      {!loaded && <ImageSkeleton className="absolute inset-0 h-full w-full" />}
      <img
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
