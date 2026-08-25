"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Search,
  Plus,
  Users,
  User as UserIcon,
  Send,
  Paperclip,
  X,
  Reply,
  Trash2,
  ShieldAlert,
  ArrowLeft,
  Lock,
  FileText,
  Check,
  ChevronRight,
  Info,
  AlertCircle,
  RotateCcw,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

function formatMessageTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

interface Props {
  session: {
    userId: string;
    role: string;
    name?: string;
    email?: string;
  };
  initialConversations?: any[];
  initialActiveId?: string;
}

type SendState = "idle" | "sending" | "failed";

export function ChatClient({ session, initialConversations = [], initialActiveId }: Props) {
  const [conversations, setConversations] = useState<any[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveId || (initialConversations.length > 0 ? initialConversations[0].id : null)
  );
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "DIRECT" | "GROUP">("ALL");

  // Message Input State
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [attachment, setAttachment] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [lastFailedPayload, setLastFailedPayload] = useState<{ content: string; attachment: any; replyId?: string; clientMsgId?: string } | null>(null);

  // UI state for scrolling & mobile
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Modals
  const [isNewDirectModalOpen, setIsNewDirectModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [foundUsers, setFoundUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const isInitialMount = useRef(true);

  // Sync activeIdRef
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/chat/conversations?search=${encodeURIComponent(debouncedSearchQuery)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setConversations(json.items || []);
        }
      }
    } catch (err) {
      console.error("Failed fetching conversations", err);
    }
  }, [debouncedSearchQuery]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch initial messages for active conversation
  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    setShowNewMessageBadge(false);
    try {
      const [res, detailsRes] = await Promise.all([
        fetch(`/api/v1/chat/conversations/${convId}/messages?limit=40`),
        fetch(`/api/v1/chat/conversations/${convId}`),
      ]);
      fetch(`/api/v1/chat/conversations/${convId}/read`, { method: "POST" }).catch(() => {});

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setMessages(json.messages || []);
          setHasMore(!!json.hasMore);
          setNextBeforeId(json.nextBeforeId || null);
        }
      }
      if (detailsRes.ok) {
        const dJson = await detailsRes.json();
        if (dJson.success) {
          setActiveConv(dJson.data);
        }
      }
    } catch (err) {
      toast.error("Failed loading messages");
    } finally {
      setLoadingMessages(false);
      setTimeout(() => scrollToBottom("auto"), 50);
    }
  }, []);

  // Load older messages (cursor pagination on scroll top)
  const loadOlderMessages = async () => {
    if (!activeId || !nextBeforeId || loadingOlder) return;

    const container = messagesContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;

    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/v1/chat/conversations/${activeId}/messages?limit=30&beforeId=${encodeURIComponent(nextBeforeId)}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const older = json.messages || [];
          setMessages((prev) => [...older, ...prev]);
          setHasMore(!!json.hasMore);
          setNextBeforeId(json.nextBeforeId || null);

          // Preserve exact scroll position
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight - oldScrollHeight;
            }
          });
        }
      }
    } catch (err) {
      toast.error("Failed loading older messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if scrolled near top to load older messages
    if (container.scrollTop < 50 && hasMore && !loadingOlder) {
      loadOlderMessages();
    }

    // Check if near bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      setShowNewMessageBadge(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowNewMessageBadge(false);
  };

  // Single persistent Realtime SSE stream setup
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        es = new EventSource("/api/v1/chat/stream");
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.action === "NEW_MESSAGE") {
              fetchConversations();
              const currentActiveId = activeIdRef.current;

              if (currentActiveId && data.conversationId === currentActiveId) {
                // If message event arrives, fetch fresh message list or append if missing
                fetchSingleNewMessage(currentActiveId, data.messageId, data.clientMessageId);
              }
            } else if (data.action === "CONVERSATION_UPDATED" || data.action === "UNREAD_UPDATE") {
              fetchConversations();
            }
          } catch {}
        };

        es.onerror = () => {
          if (es) es.close();
          // Automatic silent reconnect after 5s if disconnected
          reconnectTimer = setTimeout(connectSSE, 5000);
        };
      } catch {}
    };

    connectSSE();

    // Secondary background polling fallback (every 20s)
    const interval = setInterval(() => {
      fetchConversations();
    }, 20000);

    return () => {
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [fetchConversations]);

  // Fetch single new message or update messages feed incrementally
  const fetchSingleNewMessage = async (convId: string, messageId?: string, clientMsgId?: string) => {
    try {
      const res = await fetch(`/api/v1/chat/conversations/${convId}/messages?limit=10`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.messages) return;

      const freshMessages: any[] = json.messages;
      const container = messagesContainerRef.current;
      const isNearBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight < 150
        : true;

      setMessages((prev) => {
        // Merge without duplicating IDs or clientMessageIds
        const existingIds = new Set(prev.map((m) => m.id));
        const newToAdd = freshMessages.filter(
          (m) => !existingIds.has(m.id) && (!clientMsgId || m.clientMessageId !== clientMsgId)
        );

        if (newToAdd.length === 0) return prev;

        const updated = [...prev, ...newToAdd];
        return updated;
      });

      fetch(`/api/v1/chat/conversations/${convId}/read`, { method: "POST" }).catch(() => {});

      if (isNearBottom) {
        setTimeout(() => scrollToBottom("smooth"), 80);
      } else {
        setShowNewMessageBadge(true);
      }
    } catch {}
  };

  // Change Active Conversation
  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);
      if (isInitialMount.current) {
        isInitialMount.current = false;
      }
    }
  }, [activeId, fetchMessages]);

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    setReplyTo(null);
    setAttachment(null);
    setSendState("idle");
    setMobileShowThread(true);
  };

  // Optimistic Send Flow
  const doSend = async (content: string, att: any, replyId?: string, retryClientMsgId?: string) => {
    if (!activeId) return;

    const clientMsgId = retryClientMsgId || `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    // Create Optimistic Local Message
    const optimisticMessage = {
      id: clientMsgId,
      conversationId: activeId,
      senderId: session.userId,
      senderName: session.name || "Me",
      senderRole: session.role,
      type: att?.type?.startsWith("image/") ? "IMAGE" : att ? "FILE" : "TEXT",
      content: content ? content.trim() : att?.attachmentName || "Attachment",
      attachmentUrl: att?.attachmentUrl || null,
      attachmentName: att?.attachmentName || null,
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderName: replyTo.senderName } : null,
      createdAt: now,
      isOptimistic: true,
      status: "sending",
    };

    // Append optimistic message immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    setSendState("sending");
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Update conversation item list preview locally
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              lastMessageAt: now,
              lastMessage: {
                id: clientMsgId,
                content: optimisticMessage.content,
                type: optimisticMessage.type,
                senderId: session.userId,
                senderName: session.name || "Me",
                createdAt: now,
              },
            }
          : c
      )
    );

    try {
      const res = await fetch(`/api/v1/chat/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          attachmentUrl: att?.attachmentUrl,
          attachmentKey: att?.attachmentKey,
          attachmentName: att?.attachmentName,
          replyToId: replyId,
          clientMessageId: clientMsgId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to send message");
      }

      // Replace optimistic message with confirmed server message
      const serverMsg = json.data;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === clientMsgId
            ? {
                id: serverMsg.id,
                conversationId: serverMsg.conversationId,
                senderId: serverMsg.senderId,
                senderName: serverMsg.sender?.name || session.name || "Me",
                senderRole: serverMsg.sender?.role || session.role,
                type: serverMsg.type,
                content: serverMsg.content,
                attachmentUrl: serverMsg.attachmentUrl,
                attachmentName: serverMsg.attachmentName,
                replyTo: serverMsg.replyTo
                  ? { id: serverMsg.replyTo.id, content: serverMsg.replyTo.content, senderName: serverMsg.replyTo.sender?.name }
                  : null,
                createdAt: serverMsg.createdAt,
                isOptimistic: false,
                status: "sent",
              }
            : m
        )
      );

      setSendState("idle");
      setLastFailedPayload(null);
    } catch (err: any) {
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === clientMsgId ? { ...m, status: "failed" } : m))
      );
      setSendState("failed");
      setLastFailedPayload({ content, attachment: att, replyId, clientMsgId });
      toast.error(err.message || "Message failed to send");
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeId || sendState === "sending") return;
    if (!inputText.trim() && !attachment) return;

    const content = inputText;
    const att = attachment;
    const replyId = replyTo?.id;

    setInputText("");
    setAttachment(null);
    setReplyTo(null);

    await doSend(content, att, replyId);
  };

  const handleRetry = async () => {
    if (!lastFailedPayload) return;
    await doSend(
      lastFailedPayload.content,
      lastFailedPayload.attachment,
      lastFailedPayload.replyId,
      lastFailedPayload.clientMsgId
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/chat/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Upload failed");

      setAttachment(json.data);
      toast.success(`Attached ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "File upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      const res = await fetch(`/api/v1/chat/messages/${msgId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: "This message was deleted.", deletedAt: new Date() } : m))
      );
      toast.success("Message deleted");
    } catch (err: any) {
      toast.error(err.message || "Deletion failed");
    }
  };

  const handleUserSearch = async (q: string) => {
    setUserSearchQuery(q);
    try {
      const res = await fetch(`/api/v1/chat/users?query=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setFoundUsers(json.data || []);
        }
      }
    } catch {}
  };

  const startDirectChat = async (partnerId: string) => {
    try {
      const res = await fetch("/api/v1/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DIRECT", partnerUserId: partnerId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setIsNewDirectModalOpen(false);
      await fetchConversations();
      handleSelectConversation(json.data.id);
      toast.success("Conversation opened");
    } catch (err: any) {
      toast.error(err.message || "Failed to start direct chat");
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Group name is required");
      return;
    }

    try {
      const res = await fetch("/api/v1/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "GROUP",
          name: groupName,
          description: groupDescription,
          participantIds: selectedUserIds,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setIsNewGroupModalOpen(false);
      setGroupName("");
      setGroupDescription("");
      setSelectedUserIds([]);
      await fetchConversations();
      handleSelectConversation(json.data.id);
      toast.success(`Group "${groupName}" created`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create group");
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (filterType === "DIRECT" && c.type !== "DIRECT") return false;
    if (filterType === "GROUP" && c.type !== "GROUP") return false;
    return true;
  });

  return (
    <div className="flex h-[calc(100dvh-64px)] md:h-[calc(100vh-120px)] md:min-h-[560px] w-full overflow-hidden rounded-none md:rounded-2xl border-0 md:border md:border-[#EAEAEA] bg-white text-[#111111] md:shadow-sm">
      {/* LEFT PANEL: Conversation List */}
      <div
        className={`flex w-full flex-col border-r border-[#EAEAEA] bg-white md:w-80 md:min-w-[320px] lg:w-96 ${
          mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAEAEA] p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#F2C202]" />
            <h2 className="text-lg font-bold text-[#111111] tracking-tight">Internal Chat</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setIsNewDirectModalOpen(true);
                handleUserSearch("");
              }}
              className="p-2.5 text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F7F7F5] rounded-xl transition min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="New 1-on-1 Chat"
            >
              <UserIcon className="h-4 w-4" />
            </button>

            {["SUPER_ADMIN", "MANAGER", "SHOWROOM_INCHARGE"].includes(session.role) && (
              <button
                onClick={() => {
                  setIsNewGroupModalOpen(true);
                  handleUserSearch("");
                }}
                className="p-2.5 bg-[#F2C202] hover:bg-[#D8AD02] text-white rounded-xl transition shadow-sm min-h-[40px] min-w-[40px] flex items-center justify-center"
                title="New Group Channel"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="p-3 space-y-2 border-b border-[#EAEAEA]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6B6B]" />
            <input
              type="text"
              placeholder="Search conversations, staff, blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#F2C202] transition"
            />
          </div>

          <div className="flex items-center gap-1">
            {(["ALL", "DIRECT", "GROUP"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                  filterType === t
                    ? "bg-[#111111] text-white"
                    : "text-[#6B6B6B] hover:bg-[#F7F7F5]"
                }`}
              >
                {t === "ALL" ? "All" : t === "DIRECT" ? "Direct" : "Groups"}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#EAEAEA]">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[#6B6B6B] text-xs">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-[#EAEAEA]" />
              <p>No conversations yet.</p>
              <button
                onClick={() => {
                  setIsNewDirectModalOpen(true);
                  handleUserSearch("");
                }}
                className="mt-3 text-[#8A7300] hover:underline font-semibold"
              >
                Start a direct chat
              </button>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.id === activeId;
              const hasUnread = (c.unreadCount || 0) > 0;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={`p-3.5 cursor-pointer transition flex items-center justify-between min-h-[64px] ${
                    isSelected ? "bg-[#F2C202]/10 border-l-4 border-[#F2C202]" : "hover:bg-[#F7F7F5] border-l-4 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7F7F5] border border-[#EAEAEA] text-[#111111] font-bold text-sm">
                        {c.type === "GROUP" ? <Users className="h-5 w-5 text-[#8A7300]" /> : c.name.charAt(0).toUpperCase()}
                      </div>
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F2C202] px-1 text-[10px] font-bold text-white shadow-sm">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={`text-xs truncate ${hasUnread ? "font-bold text-[#111111]" : "font-semibold text-[#111111]"}`}>
                          {c.name}
                        </h4>
                        {c.lastMessageAt && (
                          <span className="text-[10px] text-[#6B6B6B] shrink-0" suppressHydrationWarning>
                            {formatMessageTime(c.lastMessageAt)}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-[#6B6B6B] truncate mt-0.5">
                        {c.lastMessage ? c.lastMessage.content : c.description || "Start chatting..."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Active Chat Thread */}
      <div
        className={`flex flex-1 flex-col bg-white min-h-0 relative ${
          !mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {activeConv ? (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between border-b border-[#EAEAEA] bg-white px-4 py-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden p-2 -ml-2 text-[#6B6B6B] hover:text-[#111111] rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F7F5] border border-[#EAEAEA] text-[#8A7300] font-bold text-xs shrink-0">
                  {activeConv.type === "GROUP" ? <Users className="h-4 w-4" /> : activeConv.name?.charAt(0) || "C"}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#111111] truncate">{activeConv.name || "Chat Thread"}</h3>
                    {activeConv.isSuperAdminView && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full flex items-center gap-1 shrink-0">
                        <ShieldAlert className="h-3 w-3" /> Admin View
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6B6B6B] truncate">
                    {activeConv.type === "GROUP"
                      ? `${activeConv.participants.length} Participants`
                      : activeConv.participants.find((p: any) => p.userId !== session.userId)?.user?.role || "Internal User"}
                  </p>
                </div>
              </div>

              {activeConv.blockId && (
                <Link
                  href={`/blocks?search=${encodeURIComponent(activeConv.blockId)}`}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F7F5] hover:bg-[#EAEAEA] text-[#8A7300] border border-[#EAEAEA] rounded-xl text-xs font-semibold transition shrink-0"
                >
                  <Lock className="h-3.5 w-3.5" /> Block #{activeConv.blockId} <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Messages Feed */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F7F7F5]/40"
            >
              {loadingOlder && (
                <div className="flex justify-center py-2">
                  <span className="text-[10px] font-semibold text-[#8A7300] bg-white border border-[#EAEAEA] px-3 py-1 rounded-full shadow-xs">
                    Loading older messages...
                  </span>
                </div>
              )}

              {loadingMessages && messages.length === 0 ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-[#EAEAEA]/60 rounded-xl animate-pulse w-2/3" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#6B6B6B] text-xs">
                  <MessageSquare className="h-8 w-8 mb-2 text-[#EAEAEA]" />
                  <p>No messages yet. Send a message to start.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === session.userId;
                  const isSystem = m.type === "SYSTEM_EVENT";

                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center my-2">
                        <span className="px-3 py-1 bg-white border border-[#EAEAEA] text-[#6B6B6B] text-[11px] font-medium rounded-full flex items-center gap-1.5 shadow-xs">
                          <Info className="h-3 w-3 text-[#8A7300]" /> {m.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex flex-col group ${isMine ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-[#6B6B6B]">{m.senderName}</span>
                        <span className="text-[9px] text-[#6B6B6B]/70" suppressHydrationWarning>
                          {formatMessageTime(m.createdAt)}
                        </span>
                      </div>

                      <div
                        className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs leading-relaxed ${
                          isMine
                            ? "bg-[#FEF6D8] border border-[#F2C202]/40 text-[#111111] rounded-br-sm"
                            : "bg-white border border-[#EAEAEA] text-[#111111] rounded-bl-sm shadow-xs"
                        }`}
                      >
                        {m.replyTo && (
                          <div className="mb-2 p-2 rounded-lg bg-black/[0.03] border-l-2 border-[#F2C202] text-[11px]">
                            <p className="font-semibold text-[#111111]/80">{m.replyTo.senderName}</p>
                            <p className="line-clamp-1 text-[#6B6B6B]">{m.replyTo.content}</p>
                          </div>
                        )}

                        <p className="whitespace-pre-wrap break-words">{m.content}</p>

                        {m.attachmentUrl && (
                          <div className="mt-2">
                            {m.type === "IMAGE" ? (
                              <img
                                src={m.attachmentUrl}
                                alt="Attachment"
                                className="max-h-48 rounded-lg object-cover border border-[#EAEAEA]"
                              />
                            ) : (
                              <a
                                href={m.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2 bg-black/[0.03] rounded-lg hover:bg-black/[0.06] transition text-[#8A7300]"
                              >
                                <FileText className="h-4 w-4" />
                                <span className="underline truncate max-w-[180px]">
                                  {m.attachmentName || "Attachment File"}
                                </span>
                              </a>
                            )}
                          </div>
                        )}

                        {m.status === "sending" && (
                          <span className="mt-1 block text-[9px] text-[#8A7300] font-semibold">Sending...</span>
                        )}

                        <div
                          className={`absolute top-1 hidden group-hover:flex items-center gap-1 bg-white border border-[#EAEAEA] px-1.5 py-0.5 rounded-lg text-[#6B6B6B] shadow-sm ${
                            isMine ? "-left-16" : "-right-16"
                          }`}
                        >
                          <button onClick={() => setReplyTo(m)} className="p-1 hover:text-[#111111]" title="Reply">
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          {(isMine || session.role === "SUPER_ADMIN") && (
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              className="p-1 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {m.status === "failed" && (
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-rose-600">
                          <AlertCircle className="h-3 w-3" /> Failed to send
                          <button onClick={handleRetry} className="flex items-center gap-0.5 font-semibold underline">
                            <RotateCcw className="h-2.5 w-2.5" /> Retry
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating New Message Badge */}
            {showNewMessageBadge && (
              <button
                onClick={() => scrollToBottom("smooth")}
                className="absolute bottom-20 right-6 z-10 flex items-center gap-1.5 bg-[#111111] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md hover:bg-black transition animate-bounce"
              >
                New messages <ArrowDown className="h-3.5 w-3.5" />
              </button>
            )}

            {replyTo && (
              <div className="flex items-center justify-between bg-[#F7F7F5] border-t border-[#EAEAEA] px-4 py-2 text-xs shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <Reply className="h-3.5 w-3.5 text-[#8A7300] shrink-0" />
                  <span className="text-[#6B6B6B]">Replying to <strong className="text-[#111111]">{replyTo.senderName}</strong>:</span>
                  <span className="text-[#111111] truncate">{replyTo.content}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-[#6B6B6B] hover:text-[#111111] p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {attachment && (
              <div className="flex items-center justify-between bg-[#FEF6D8] border-t border-[#F2C202]/30 px-4 py-2 text-xs shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip className="h-3.5 w-3.5 text-[#8A7300] shrink-0" />
                  <span className="text-[#111111] font-semibold truncate">{attachment.attachmentName}</span>
                </div>
                <button onClick={() => setAttachment(null)} className="text-[#6B6B6B] hover:text-[#111111] p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Message Input Box — pinned, safe-area aware for mobile keyboards */}
            <form
              onSubmit={handleSendMessage}
              className="border-t border-[#EAEAEA] bg-white p-3 shrink-0"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-2.5 text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F7F7F5] rounded-xl transition min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 min-w-0 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl px-4 py-3 md:py-2.5 text-sm md:text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#F2C202] transition"
                />

                <button
                  type="submit"
                  disabled={sendState === "sending" || (!inputText.trim() && !attachment)}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 bg-[#F2C202] hover:bg-[#D8AD02] disabled:opacity-40 text-white rounded-xl transition shadow-sm shrink-0"
                >
                  {sendState === "sending" ? (
                    <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#6B6B6B] p-8 text-center">
            <MessageSquare className="h-12 w-12 text-[#EAEAEA] mb-3" />
            <h3 className="text-base font-bold text-[#111111]">No Conversation Selected</h3>
            <p className="text-xs text-[#6B6B6B] max-w-sm mt-1">
              Select a conversation from the left menu or click New Chat to start communicating.
            </p>
          </div>
        )}
      </div>

      {/* Modal: New Direct 1-on-1 Chat */}
      {isNewDirectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsNewDirectModalOpen(false)} />
          <div className="relative bg-white border border-[#EAEAEA] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111111]">Start 1-on-1 Chat</h3>
              <button onClick={() => setIsNewDirectModalOpen(false)} className="text-[#6B6B6B] hover:text-[#111111] p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6B6B]" />
              <input
                type="text"
                placeholder="Search staff by name, email, role..."
                value={userSearchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#111111] focus:outline-none focus:border-[#F2C202]"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#EAEAEA]">
              {foundUsers.length === 0 ? (
                <p className="p-4 text-center text-xs text-[#6B6B6B]">No matching active users.</p>
              ) : (
                foundUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => startDirectChat(u.id)}
                    className="p-3 flex items-center justify-between hover:bg-[#F7F7F5] cursor-pointer rounded-xl transition min-h-[52px]"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-[#111111]">{u.name}</h4>
                      <p className="text-[10px] text-[#6B6B6B]">{u.role} • {u.email}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#6B6B6B]" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Group Operational Channel */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsNewGroupModalOpen(false)} />
          <div className="relative bg-white border border-[#EAEAEA] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111111]">Create Group Channel</h3>
              <button onClick={() => setIsNewGroupModalOpen(false)} className="text-[#6B6B6B] hover:text-[#111111] p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mangalore Showroom Operational"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl px-3.5 py-2.5 text-xs text-[#111111] focus:outline-none focus:border-[#F2C202]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Purpose of this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl px-3.5 py-2.5 text-xs text-[#111111] focus:outline-none focus:border-[#F2C202]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">Add Members</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6B6B6B]" />
                  <input
                    type="text"
                    placeholder="Search users to add..."
                    value={userSearchQuery}
                    onChange={(e) => handleUserSearch(e.target.value)}
                    className="w-full bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl pl-8 pr-3 py-2 text-xs text-[#111111] focus:outline-none focus:border-[#F2C202]"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1">
                  {foundUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          setSelectedUserIds((prev) =>
                            isSelected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          );
                        }}
                        className={`p-2.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition min-h-[40px] ${
                          isSelected ? "bg-[#F2C202]/10 text-[#8A7300] border border-[#F2C202]/40" : "bg-[#F7F7F5] hover:bg-[#EAEAEA] text-[#111111]"
                        }`}
                      >
                        <span>{u.name} ({u.role})</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-[#8A7300]" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewGroupModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-[#6B6B6B] hover:text-[#111111]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#F2C202] hover:bg-[#D8AD02] text-white font-bold text-xs rounded-xl shadow-sm"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
