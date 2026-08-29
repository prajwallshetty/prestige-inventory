"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Catches any otherwise-uncaught render/data error under the root layout —
 * every authenticated page, /login, /offline. Without this the app fell
 * through to Next's default error screen (dev) or a blank page (prod), with
 * no way back except a manual URL edit.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[UNCAUGHT ERROR]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#EAEAEA] bg-white p-8 text-center shadow-sm">
        <h1 className="text-sm font-bold text-[#111111]">Something went wrong.</h1>
        <p className="mt-2 text-xs text-[#6B6B6B]">
          An unexpected error occurred. Your data has not been changed — try again, or reload the page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#F2C202] px-4 text-xs font-black text-white shadow-sm hover:bg-[#D8AD02] transition-all"
        >
          <RotateCcw className="h-4 w-4" /> Retry
        </button>
      </div>
    </div>
  );
}
