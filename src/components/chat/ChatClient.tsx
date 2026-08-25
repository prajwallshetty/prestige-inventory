"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Edit2,
  CheckCheck,
  ShieldAlert,
  ArrowLeft,
  Boxes,
  Lock,
  Truck,
  FileText,
  Image as ImageIcon,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";

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

export function ChatClient({ session, initialConversations = [], initialActiveId }: Props) {
  const [conversations, setConversations] = useState<any[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveId || (initialConversations.length > 0 ? initialConversations[0].id : null)
  );
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "DIRECT" | "GROUP">("ALL");

  // Message Input State
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [attachment, setAttachment] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Modals
  const [isNewDirectModalOpen, setIsNewDirectModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [foundUsers, setFoundUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile View Toggle State
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`/api/v1/chat/conversations?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setConversations(json.items || []);
        }
      }
    } catch (err) {
      console.error("Failed fetching conversations", err);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 8000);

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v1/chat/stream");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === "NEW_MESSAGE" || data.action === "CONVERSATION_UPDATED") {
            fetchConversations();
            if (activeId && data.conversationId === activeId) {
              fetchMessages(activeId);
            }
          }
        } catch {}
      };
    } catch {}

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, [searchQuery, activeId]);

  const fetchMessages = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/v1/chat/conversations/${convId}/messages?limit=60`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setMessages(json.messages || []);
        }
      }
      // Fetch details
      const detailsRes = await fetch(`/api/v1/chat/conversations/${convId}`);
      if (detailsRes.ok) {
        const dJson = await detailsRes.json();
        if (dJson.success) {
          setActiveConv(dJson.data);
        }
      }
      // Mark read
      await fetch(`/api/v1/chat/conversations/${convId}/read`, { method: "POST" });
    } catch (err) {
      toast.error("Failed loading messages");
    } finally {
      setLoadingMessages(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setMobileShowThread(true);
      }

      // Polling fallback so a message from the other side of the conversation
      // shows up without a manual refresh even when Redis/SSE isn't delivering
      // (e.g. no REDIS_URL configured for this deployment).
      const poll = setInterval(() => pollNewMessages(activeId), 5000);
      return () => clearInterval(poll);
    }
  }, [activeId]);

  const pollNewMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/v1/chat/conversations/${convId}/messages?limit=60`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      const fresh = json.messages || [];
      setMessages((prev) => {
        const prevLastId = prev[prev.length - 1]?.id;
        const freshLastId = fresh[fresh.length - 1]?.id;
        if (prev.length === fresh.length && prevLastId === freshLastId) return prev;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        return fresh;
      });
      fetch(`/api/v1/chat/conversations/${convId}/read`, { method: "POST" }).catch(() => {});
    } catch {
      // best-effort; next tick or the SSE stream will catch up
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    setReplyTo(null);
    setAttachment(null);
    setMobileShowThread(true);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeId || sending) return;
    if (!inputText.trim() && !attachment) return;

    setSending(true);
    const content = inputText;
    const att = attachment;
    const replyId = replyTo?.id;

    setInputText("");
    setAttachment(null);
    setReplyTo(null);

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
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to send message");
      }

      // Append optimistic or refetch
      fetchMessages(activeId);
      fetchConversations();
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
      setInputText(content);
      setAttachment(att);
    } finally {
      setSending(false);
    }
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

  // Search users for new direct chat
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
      setActiveId(json.data.id);
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
      setActiveId(json.data.id);
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
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
      {/* LEFT PANEL: Conversation List */}
      <div
        className={`flex w-full flex-col border-r border-slate-800 bg-slate-900 md:w-80 md:min-w-[320px] lg:w-96 ${
          mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Internal Chat</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setIsNewDirectModalOpen(true);
                handleUserSearch("");
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
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
                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-md"
                title="New Group Channel"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="p-3 space-y-2 border-b border-slate-800/60">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations, staff, blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex items-center gap-1">
            {(["ALL", "DIRECT", "GROUP"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition ${
                  filterType === t
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {t === "ALL" ? "All" : t === "DIRECT" ? "Direct" : "Groups"}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <p>No conversations found.</p>
              <button
                onClick={() => {
                  setIsNewDirectModalOpen(true);
                  handleUserSearch("");
                }}
                className="mt-3 text-indigo-400 hover:underline font-semibold"
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
                  className={`p-3.5 cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? "bg-indigo-600/10 border-l-4 border-indigo-500"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm">
                        {c.type === "GROUP" ? <Users className="h-5 w-5 text-indigo-400" /> : c.name.charAt(0).toUpperCase()}
                      </div>
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-slate-200"}`}>
                          {c.name}
                        </h4>
                        {c.lastMessageAt && (
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
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
        className={`flex flex-1 flex-col bg-slate-950 ${
          !mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {activeConv ? (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold text-xs">
                  {activeConv.type === "GROUP" ? <Users className="h-4 w-4" /> : activeConv.name?.charAt(0) || "C"}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{activeConv.name || "Chat Thread"}</h3>
                    {activeConv.isSuperAdminView && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> Administrative View
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {activeConv.type === "GROUP"
                      ? `${activeConv.participants.length} Participants`
                      : activeConv.participants.find((p: any) => p.userId !== session.userId)?.user?.role || "Internal User"}
                  </p>
                </div>
              </div>

              {/* Linked Operational Details Banner */}
              {activeConv.blockId && (
                <Link
                  href={`/blocks?search=${encodeURIComponent(activeConv.blockId)}`}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
                >
                  <Lock className="h-3.5 w-3.5" /> Block #{activeConv.blockId} <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingMessages && messages.length === 0 ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-slate-900 rounded-xl animate-pulse w-2/3" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                  <p>No messages yet. Send a message to start.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === session.userId;
                  const isSystem = m.type === "SYSTEM_EVENT";

                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center my-2">
                        <span className="px-3 py-1 bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-medium rounded-full flex items-center gap-1.5 shadow-xs">
                          <Info className="h-3 w-3 text-indigo-400" /> {m.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col group ${isMine ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-400">{m.senderName}</span>
                        <span className="text-[9px] text-slate-500">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <div
                        className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs leading-relaxed shadow-lg ${
                          isMine
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
                        }`}
                      >
                        {/* Reply reference */}
                        {m.replyTo && (
                          <div className="mb-2 p-2 rounded-lg bg-black/20 border-l-2 border-indigo-300 text-[11px]">
                            <p className="font-semibold opacity-90">{m.replyTo.senderName}</p>
                            <p className="line-clamp-1 opacity-75">{m.replyTo.content}</p>
                          </div>
                        )}

                        {/* Content */}
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>

                        {/* Attachment display */}
                        {m.attachmentUrl && (
                          <div className="mt-2">
                            {m.type === "IMAGE" || m.attachmentUrl.startsWith("data:image/") ? (
                              <img
                                src={m.attachmentUrl}
                                alt="Attachment"
                                className="max-h-48 rounded-lg object-cover border border-black/20"
                              />
                            ) : (
                              <a
                                href={m.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2 bg-black/20 rounded-lg hover:bg-black/30 transition text-indigo-200"
                              >
                                <FileText className="h-4 w-4" />
                                <span className="underline truncate max-w-[180px]">
                                  {m.attachmentName || "Attachment File"}
                                </span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Hover Actions */}
                        <div
                          className={`absolute top-1 hidden group-hover:flex items-center gap-1 bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 rounded-lg text-slate-400 ${
                            isMine ? "-left-16" : "-right-16"
                          }`}
                        >
                          <button
                            onClick={() => setReplyTo(m)}
                            className="p-1 hover:text-white"
                            title="Reply"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          {(isMine || session.role === "SUPER_ADMIN") && (
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              className="p-1 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quoted Reply Preview */}
            {replyTo && (
              <div className="flex items-center justify-between bg-slate-900 border-t border-slate-800 px-4 py-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Reply className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400">Replying to <strong className="text-white">{replyTo.senderName}</strong>:</span>
                  <span className="text-slate-300 truncate">{replyTo.content}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-slate-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Attachment Preview */}
            {attachment && (
              <div className="flex items-center justify-between bg-indigo-950/40 border-t border-indigo-500/30 px-4 py-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="text-indigo-200 font-semibold truncate">{attachment.attachmentName}</span>
                </div>
                <button onClick={() => setAttachment(null)} className="text-slate-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="border-t border-slate-800 bg-slate-900 p-3">
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
                  className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <input
                  type="text"
                  placeholder="Type a message... (Shift + Enter for new line)"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />

                <button
                  type="submit"
                  disabled={sending || (!inputText.trim() && !attachment)}
                  className="flex items-center justify-center p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition shadow-md"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
            <MessageSquare className="h-12 w-12 text-slate-700 mb-3" />
            <h3 className="text-base font-bold text-slate-300">No Conversation Selected</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Select a conversation from the left menu or click New Chat to start communicating.
            </p>
          </div>
        )}
      </div>

      {/* Modal: New Direct 1-on-1 Chat */}
      {isNewDirectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Start 1-on-1 Chat</h3>
              <button onClick={() => setIsNewDirectModalOpen(false)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search staff by name, email, role..."
                value={userSearchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/50">
              {foundUsers.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500">No matching active users.</p>
              ) : (
                foundUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => startDirectChat(u.id)}
                    className="p-3 flex items-center justify-between hover:bg-slate-800/50 cursor-pointer rounded-xl transition"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white">{u.name}</h4>
                      <p className="text-[10px] text-slate-400">{u.role} • {u.email}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Group Operational Channel */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create Group Channel</h3>
              <button onClick={() => setIsNewGroupModalOpen(false)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mangalore Showroom Operational"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Purpose of this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Add Members</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search users to add..."
                    value={userSearchQuery}
                    onChange={(e) => handleUserSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                        className={`p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${
                          isSelected ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40" : "bg-slate-950 hover:bg-slate-800 text-slate-300"
                        }`}
                      >
                        <span>{u.name} ({u.role})</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewGroupModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg"
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
