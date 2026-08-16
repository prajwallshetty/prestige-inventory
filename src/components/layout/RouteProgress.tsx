"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar for route transitions.
 *
 * Intercepts clicks on internal <a> elements during the capture phase, which
 * fires before Next.js begins the transition — so the bar appears on the same
 * tick as the click rather than after the server responds. It then eases toward
 * (but never reaches) 100% and completes only when the new pathname commits.
 *
 * Deliberately not a fixed-duration animation: the trickle is asymptotic, so a
 * slow route keeps creeping instead of sitting at a fake "done" state.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    timerRef.current = null;
    hideRef.current = null;
  };

  // Start on any click that will result in an internal navigation.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Ignore modified clicks — those open new tabs, no transition happens.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      // Only same-origin, non-hash navigations
      if (!href.startsWith("/") || href.startsWith("/#")) return;

      const dest = new URL(href, window.location.origin);
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;

      stopTimers();
      setVisible(true);
      setProgress(8);
      timerRef.current = setInterval(() => {
        // Asymptotic trickle: fast early, crawling as it nears the top.
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) * 0.06)));
      }, 120);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Complete when the route actually commits.
  useEffect(() => {
    if (!visible) return;
    stopTimers();
    setProgress(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
    return stopTimers;
    // Intentionally keyed on the committed route, not `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => stopTimers, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-transparent"
    >
      <div
        className="h-full bg-[#F2C202] shadow-[0_0_8px_rgba(242,194,2,0.7)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
