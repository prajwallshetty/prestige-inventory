"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

interface Props {
  role?: string;
  initialUnreadCount?: number;
}

export function ChatHeaderBadge({ role, initialUnreadCount = 0 }: Props) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const pathPrefix =
    role === "SUPER_ADMIN"
      ? "/admin"
      : role === "MANAGER"
      ? "/warehouse"
      : role === "SHOWROOM_STAFF"
      ? "/showroom-staff"
      : role === "SHOWROOM_INCHARGE"
      ? "/showroom-incharge"
      : "/viewer";

  const fetchUnread = async () => {
    try {
      const res = await fetch("/api/v1/chat/unread-count");
      if (res.ok) {
        const json = await res.json();
        if (json.success && typeof json.unreadCount === "number") {
          setUnreadCount(json.unreadCount);
        }
      }
    } catch {
      // Ignore network errors silently for badge
    }
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 12000);

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v1/chat/stream");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === "NEW_MESSAGE" || data.action === "UNREAD_UPDATE") {
            fetchUnread();
          }
        } catch {}
      };
    } catch {}

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, []);

  return (
    <Link
      href="/chat"
      className="relative flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
      title="Internal Company Chat"
    >
      <MessageSquare className="w-5 h-5 text-indigo-400" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white shadow-md animate-pulse">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
