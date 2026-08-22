"use client";

import { useEffect, useState } from "react";

/**
 * Offline handling for mutation surfaces (spec §39).
 *
 * A server action fired with no connection does not fail fast — the browser
 * queues it and the caller sits on a pending promise until the request finally
 * times out, which reads to the user as a dead button. Every mutation entry
 * point checks `isOffline()` first and reports the standard message instead.
 *
 * This is a UX guard, not a security control: the server still authorises and
 * validates every request it actually receives.
 */

export const OFFLINE_MESSAGE = "You are offline. Reconnect before performing this action.";

/**
 * True when the browser is certain it has no connection.
 *
 * `navigator.onLine === true` only means a network interface exists, so this
 * deliberately never blocks on a false positive — it returns true solely for
 * the unambiguous offline case.
 */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Live connection state, for disabling controls and showing a banner. */
export function useOnlineStatus(): boolean {
  // Starts optimistic: the server render has no navigator, and assuming
  // offline would flash a warning banner on every first paint.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
