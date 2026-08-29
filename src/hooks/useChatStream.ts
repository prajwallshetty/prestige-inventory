"use client";

import { useEffect, useRef } from "react";

/**
 * One shared SSE connection to /api/v1/chat/stream per browser tab.
 *
 * Before this, every chat-aware component (the sidebar's unread badge, the
 * chat page itself) opened its own `EventSource`, so a single tab held two
 * independent connections and two independent Redis subscriptions to the
 * same per-user channel — double the server load and double the reconnect
 * churn for no benefit. This hook lets any number of components subscribe to
 * one underlying connection, ref-counted so it opens on first subscriber and
 * closes when the last one unmounts.
 */

type ChatStreamHandler = (data: any) => void;
type ChatStreamStatus = "connecting" | "connected" | "disconnected";
type ChatStreamStatusHandler = (status: ChatStreamStatus) => void;

let sharedSource: EventSource | null = null;
let refCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let currentStatus: ChatStreamStatus = "disconnected";

const messageHandlers = new Set<ChatStreamHandler>();
const statusHandlers = new Set<ChatStreamStatusHandler>();

function setStatus(status: ChatStreamStatus) {
  currentStatus = status;
  statusHandlers.forEach((h) => h(status));
}

function connect() {
  if (sharedSource || typeof window === "undefined") return;
  setStatus("connecting");
  try {
    const es = new EventSource("/api/v1/chat/stream");
    sharedSource = es;

    es.onopen = () => setStatus("connected");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.action === "CONNECTED") {
          setStatus("connected");
          return;
        }
        if (data.action === "HEARTBEAT") return;
        messageHandlers.forEach((h) => h(data));
      } catch {
        /* malformed event — ignore */
      }
    };

    es.onerror = () => {
      setStatus("disconnected");
      if (sharedSource) {
        sharedSource.close();
        sharedSource = null;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (refCount > 0) connect();
      }, 5000);
    };
  } catch {
    setStatus("disconnected");
  }
}

function teardownIfIdle() {
  if (refCount > 0) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sharedSource) {
    sharedSource.close();
    sharedSource = null;
  }
  setStatus("disconnected");
}

export function useChatStream(onMessage: ChatStreamHandler, onStatus?: ChatStreamStatusHandler) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    const messageHandler: ChatStreamHandler = (data) => onMessageRef.current(data);
    const statusHandler: ChatStreamStatusHandler = (status) => onStatusRef.current?.(status);

    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }

    refCount++;
    messageHandlers.add(messageHandler);
    statusHandlers.add(statusHandler);
    statusHandler(currentStatus);
    connect();

    return () => {
      refCount--;
      messageHandlers.delete(messageHandler);
      statusHandlers.delete(statusHandler);
      // A short grace period so a fast unmount/remount (route change swapping
      // which component is subscribed) doesn't tear down and reopen the
      // connection for no reason.
      if (teardownTimer) clearTimeout(teardownTimer);
      teardownTimer = setTimeout(teardownIfIdle, 500);
    };
  }, []);
}
