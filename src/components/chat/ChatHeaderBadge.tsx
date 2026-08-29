"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useChatStream } from "@/hooks/useChatStream";

interface Props {
  role?: string;
  initialUnreadCount?: number;
}

export function ChatHeaderBadge({ initialUnreadCount = 0 }: Props) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const fetchUnread = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchUnread();
    // Long-interval safety net — the shared SSE stream below is the primary
    // signal now, this just covers a dropped/undelivered event.
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Shares one EventSource connection with ChatClient (when the chat page is
  // also mounted) instead of opening a second one — see useChatStream.
  useChatStream(
    useCallback(
      (data) => {
        if (data.action === "NEW_MESSAGE" || data.action === "UNREAD_UPDATE") {
          fetchUnread();
        }
      },
      [fetchUnread]
    )
  );

  return (
    <Link
      href="/chat"
      className="relative flex items-center justify-center h-9 w-9 rounded-xl border border-[#EAEAEA] bg-white text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F7F7F5] transition"
      title="Internal Company Chat"
    >
      <MessageSquare className="w-4 h-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F2C202] px-1 text-[10px] font-bold text-white shadow-sm">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
