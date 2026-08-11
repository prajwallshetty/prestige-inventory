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
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg animate-pulse">
          <WifiOff className="h-4 w-4" />
          <span>You are currently offline. Critical stock reservations are disabled.</span>
        </div>
      )}

      {/* Online Re-connection Alert Bar */}
      {!isOffline && typeof window !== "undefined" && !navigator.onLine && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg">
          <Wifi className="h-4 w-4" />
          <span>Reconnected to Prestige server. Live database active.</span>
        </div>
      )}

      {/* PWA Update Banner */}
      {showUpdate && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl animate-bounce">
          <p className="text-xs font-bold text-white">A new app version is available.</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleUpdateApp}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-slate-950 hover:bg-amber-400"
            >
              <RefreshCw className="h-3 w-3" /> Update Now
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white"
            >
              Not Now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
