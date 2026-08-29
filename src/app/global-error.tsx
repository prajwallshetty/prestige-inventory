"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself (rare — the root layout
 * has no data fetching of its own). Replaces the entire document while
 * active, so it renders its own <html>/<body> rather than relying on
 * globals.css or any shared chrome.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[UNCAUGHT ROOT ERROR]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#F7F7F5", color: "#111111", fontFamily: "sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 360, width: "100%", background: "#fff", border: "1px solid #EAEAEA", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Something went wrong.</h1>
            <p style={{ fontSize: 12, color: "#6B6B6B", marginTop: 8 }}>
              The application failed to load. Try again, or reload the page.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: 20, width: "100%", minHeight: 44, background: "#F2C202", color: "#fff", fontSize: 12, fontWeight: 900, border: "none", borderRadius: 12, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
