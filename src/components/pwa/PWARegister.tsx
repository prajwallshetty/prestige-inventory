"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function PWARegister() {
  const [isOffline, setIsOffline] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Check initial online status
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Register service worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setSwRegistration(reg);

          // Check for service worker updates
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  setShowUpdate(true);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error("Service worker registration failed:", err);
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleUpdateApp = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    setShowUpdate(false);
    window.location.reload();
  };

  return (
    <>
      {/* Offline Alert Bar */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You're offline. Reconnect to continue. Critical operations are disabled.</span>
        </div>
      )}

      {/* PWA Update Banner */}
      {showUpdate && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xl text-xs space-y-2">
          <p className="font-bold text-[#111111]">New version available</p>
          <p className="text-[11px] text-[#6B6B6B]">An updated version of Prestige Inventory is ready.</p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUpdateApp}
              className="flex items-center gap-1.5 rounded-lg bg-[#F2C202] px-3.5 py-1.5 text-[10px] font-black text-white hover:bg-[#D8AD02] transition-all cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Update
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-1.5 text-[10px] font-bold text-[#6B6B6B] hover:text-[#111111] transition-all cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
