"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  getNotificationsAction, 
  getUnreadCountAction, 
  markNotificationAsReadAction, 
  markAllNotificationsAsReadAction, 
  deleteNotificationAction 
} from "@/app/actions";
import { 
  Bell, 
  X, 
  Check, 
  Trash2, 
  Volume2, 
  Lock, 
  Boxes, 
  AlertTriangle, 
  ExternalLink 
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface NotificationCenterProps {
  session: any;
}

export function NotificationCenter({ session }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"ALL" | "UNREAD" | "BOOKINGS" | "INVENTORY" | "ANNOUNCEMENTS">("ALL");
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    try {
      const count = await getUnreadCountAction();
      setUnreadCount(count);
    } catch (err) {
      console.warn("Failed fetching unread notification count:", err);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const list = await getNotificationsAction(20);
      setNotifications(list);
    } catch (err) {
      console.warn("Failed fetching notifications list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();

    // Setup SSE connection for instant push notifications
    let eventSource: EventSource | null = null;
    if (typeof window !== "undefined" && session) {
      try {
        eventSource = new EventSource("/api/v1/notifications/stream");
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === "NEW_NOTIFICATION" && data.notification) {
              setUnreadCount((prev) => prev + 1);
              toast.info(data.notification.title, {
                description: data.notification.message,
              });
              setNotifications((prev) => [data.notification, ...prev]);
            }
          } catch (err) {
            console.warn("[SSE] Event parse error:", err);
          }
        };
      } catch (err) {
        console.warn("[SSE] EventSource init failed, using polling fallback.", err);
      }
    }

    // Polling fallback every 12 seconds
    const timer = setInterval(() => {
      fetchCount();
      if (isOpen) {
        getNotificationsAction(20).then(setNotifications);
      }
    }, 12000);

    return () => {
      clearInterval(timer);
      if (eventSource) eventSource.close();
    };
  }, [isOpen, session]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside listener for desktop dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // These actions report failure in their return value rather than throwing, so
  // the local list is only updated once the server has actually confirmed.
  const handleMarkRead = async (id: string) => {
    try {
      const res = await markNotificationAsReadAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date() } : n))
      );
      fetchCount();
    } catch {
      toast.error("Could not update the notification. Please try again.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsAsReadAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })));
      fetchCount();
    } catch {
      toast.error("Could not update your notifications. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteNotificationAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      fetchCount();
    } catch {
      toast.error("Could not remove the notification. Please try again.");
    }
  };

  // Filter list locally based on active tab
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "UNREAD") return !n.isRead;
    if (activeTab === "BOOKINGS") return n.type.startsWith("BOOKING_") || n.type.startsWith("BLOCK_");
    if (activeTab === "INVENTORY") return n.type.includes("STOCK_") || n.type.includes("LOW_STOCK");
    if (activeTab === "ANNOUNCEMENTS") return n.type === "SYSTEM_ANNOUNCEMENT" || n.type === "GENERAL_ANNOUNCEMENT";
    return true; // ALL
  });

  const getIcon = (type: string) => {
    if (type.startsWith("BOOKING_") || type.startsWith("BLOCK_")) return <Lock className="h-3.5 w-3.5 text-blue-600" />;
    if (type.includes("STOCK_") || type.includes("LOW_STOCK")) return <Boxes className="h-3.5 w-3.5 text-emerald-600" />;
    if (type === "SYSTEM_ANNOUNCEMENT") return <Volume2 className="h-3.5 w-3.5 text-purple-600" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  };

  const getPriorityStyle = (priority: string, isRead: boolean) => {
    if (isRead) return "border-l-2 border-transparent bg-white";
    if (priority === "URGENT") return "border-l-4 border-rose-500 bg-rose-50/50";
    if (priority === "HIGH") return "border-l-4 border-amber-500 bg-amber-50/30";
    return "border-l-2 border-transparent bg-[#F2C202]/5";
  };

  const formatTime = (dateStr: string) => {
    const diffMs = new Date().getTime() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  // Safe navigation target resolver
  const getRouteTarget = (n: any) => {
    const payload = typeof n.data === "string" ? JSON.parse(n.data) : n.data || {};
    const pathPrefix = session?.role === "SUPER_ADMIN" ? "/admin" 
      : session?.role === "MANAGER" ? "/warehouse" 
      : session?.role === "DEALER" ? "/dealer" 
      : session?.role === "SHOWROOM_STAFF" ? "/showroom-staff"
      : session?.role === "SHOWROOM_INCHARGE" ? "/showroom-incharge"
      : "/viewer";

    if (payload.blockId || payload.bookingId) {
      return `${pathPrefix}/blocks`; // Route to block/booking queue
    }
    if (payload.productId) {
      return `${pathPrefix}/inventory`; // Route to product list
    }
    return "#";
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Header Bell Trigger */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2 text-[#6B6B6B] hover:text-[#111111] transition-all touch-target cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* DESKTOP DROPDOWN */}
      {isOpen && (
        <div className="hidden md:block absolute right-0 mt-2.5 w-[380px] rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xl z-50 text-xs text-[#111111] space-y-3">
          <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#F2C202]/20 px-2 py-0.5 text-[10px] font-black text-[#8A7300]">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllRead}
                className="text-[10px] font-black text-[#8A7300] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filtering tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-[#F7F7F5]">
            {(["ALL", "UNREAD", "BOOKINGS", "INVENTORY", "ANNOUNCEMENTS"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === tab 
                    ? "bg-[#F2C202] text-white" 
                    : "text-[#6B6B6B] hover:bg-[#F7F7F5]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Notification List Scroll area */}
          <div className="max-h-[300px] overflow-y-auto divide-y divide-[#F7F7F5] pr-1 space-y-1">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-[#6B6B6B] italic">Loading alerts...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-8 text-center text-[#6B6B6B] italic">No notifications in this filter.</div>
            ) : (
              filteredNotifications.map((n) => (
                <div 
                  key={n.id} 
                  className={`p-2.5 rounded-lg flex gap-3 transition-colors ${getPriorityStyle(n.priority, n.isRead)}`}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <span className={`font-bold ${n.isRead ? "text-[#6B6B6B]" : "text-[#111111]"}`}>{n.title}</span>
                      <span className="text-[9px] text-[#9A9A9A] font-bold shrink-0">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="text-[#6B6B6B] leading-relaxed text-[11px]">{n.message}</p>
                    
                    {/* Inline Actions */}
                    <div className="flex justify-between items-center pt-1.5 border-t border-[#F7F7F5]/50">
                      <div className="flex gap-2">
                        {!n.isRead && (
                          <button 
                            onClick={() => handleMarkRead(n.id)}
                            className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 hover:underline cursor-pointer"
                          >
                            <Check className="h-2.5 w-2.5" /> Read
                          </button>
                        )}
                        {getRouteTarget(n) !== "#" && (
                          <Link 
                            href={getRouteTarget(n)}
                            onClick={() => { setIsOpen(false); if (!n.isRead) handleMarkRead(n.id); }}
                            className="flex items-center gap-0.5 text-[9px] font-bold text-[#8A7300] hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" /> View Details
                          </Link>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDelete(n.id)}
                        className="text-[#6B6B6B] hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MOBILE FULL-SCREEN MODAL */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#F7F7F5] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-[#EAEAEA] px-4 py-3.5 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-[#111111] uppercase tracking-wide">Notifications Queue</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white">
                  {unreadCount} New
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-bold text-[#8A7300] hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5]"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Filtering tabs */}
          <div className="bg-white px-4 py-2 border-b border-[#EAEAEA] flex gap-1.5 overflow-x-auto shrink-0 select-none">
            {(["ALL", "UNREAD", "BOOKINGS", "INVENTORY", "ANNOUNCEMENTS"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider shrink-0 transition-all ${
                  activeTab === tab 
                    ? "bg-[#F2C202] text-white" 
                    : "text-[#6B6B6B] bg-[#F7F7F5] border border-[#EAEAEA]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* List Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#F7F7F5]">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B6B6B] italic">Loading notifications...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B6B6B] italic">No notifications found.</div>
            ) : (
              filteredNotifications.map((n) => (
                <div 
                  key={n.id} 
                  className={`rounded-xl border border-[#EAEAEA] p-4 flex gap-3 shadow-xs ${getPriorityStyle(n.priority, n.isRead)}`}
                >
                  <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <span className={`font-bold ${n.isRead ? "text-[#6B6B6B]" : "text-[#111111]"}`}>{n.title}</span>
                      <span className="text-[9px] text-[#9A9A9A] font-bold shrink-0">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="text-[#6B6B6B] text-[11px] leading-relaxed">{n.message}</p>

                    <div className="flex justify-between items-center pt-2 border-t border-[#EAEAEA]/80">
                      <div className="flex gap-3">
                        {!n.isRead && (
                          <button 
                            onClick={() => handleMarkRead(n.id)}
                            className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700"
                          >
                            <Check className="h-3 w-3" /> Mark Read
                          </button>
                        )}
                        {getRouteTarget(n) !== "#" && (
                          <Link 
                            href={getRouteTarget(n)}
                            onClick={() => { setIsOpen(false); if (!n.isRead) handleMarkRead(n.id); }}
                            className="flex items-center gap-0.5 text-[9px] font-bold text-[#8A7300]"
                          >
                            <ExternalLink className="h-3 w-3" /> Details
                          </Link>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDelete(n.id)}
                        className="text-[#6B6B6B] hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
