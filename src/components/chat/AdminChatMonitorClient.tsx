"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  MessageSquare,
  Users,
  Search,
  Eye,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ChatClient } from "./ChatClient";

/** Pinned timezone so SSR and client hydration compute the identical string (see ChatClient). */
function formatMessageDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

interface Props {
  session: any;
  initialStats?: any;
  initialConversations?: any[];
}

export function AdminChatMonitorClient({ session, initialStats, initialConversations = [] }: Props) {
  const [stats, setStats] = useState(initialStats || null);
  const [conversations, setConversations] = useState<any[]>(initialConversations);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [activeTab, setActiveTab] = useState<"MONITOR" | "ALL_CHATS">("MONITOR");
  const [inspectedConvId, setInspectedConvId] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/v1/chat/admin/monitor");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStats(json.stats);
          setConversations(json.conversations || []);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/v1/chat/admin/search?query=${encodeURIComponent(globalQuery)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Search failed");

      setSearchResults(json.data || []);
    } catch (err: any) {
      toast.error(err.message || "Global search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleInspectConversation = (convId: string) => {
    setInspectedConvId(convId);
    setActiveTab("ALL_CHATS");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-[#EAEAEA] p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-[#8A7300] font-semibold text-xs uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" /> Super Admin Global Oversight
          </div>
          <h1 className="text-2xl font-bold text-[#111111] tracking-tight">Company Chat Monitor & Audit</h1>
          <p className="text-[#6B6B6B] text-sm mt-1">
            Administrative monitoring, audit trails, and global keyword search across all internal communications.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab("MONITOR")}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition ${
              activeTab === "MONITOR"
                ? "bg-[#111111] text-white"
                : "bg-[#F7F7F5] text-[#6B6B6B] hover:text-[#111111]"
            }`}
          >
            Monitor Dashboard
          </button>
          <button
            onClick={() => setActiveTab("ALL_CHATS")}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition ${
              activeTab === "ALL_CHATS"
                ? "bg-[#111111] text-white"
                : "bg-[#F7F7F5] text-[#6B6B6B] hover:text-[#111111]"
            }`}
          >
            All Conversations
          </button>
        </div>
      </div>

      {activeTab === "MONITOR" ? (
        <div className="space-y-6">
          {/* Stats Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-[#EAEAEA] p-5 rounded-2xl space-y-1 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] block">Total Conversations</span>
              <p className="text-2xl font-black text-[#111111]">{stats?.totalConversations ?? conversations.length}</p>
              <span className="text-[10px] text-[#6B6B6B]">Direct & group channels</span>
            </div>

            <div className="bg-white border border-[#EAEAEA] p-5 rounded-2xl space-y-1 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] block">Active Channels</span>
              <p className="text-2xl font-black text-[#111111]">{stats?.activeConversations ?? conversations.length}</p>
              <span className="text-[10px] text-[#6B6B6B]">Currently active</span>
            </div>

            <div className="bg-white border border-[#EAEAEA] p-5 rounded-2xl space-y-1 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] block">Messages Today</span>
              <p className="text-2xl font-black text-[#111111]">{stats?.messagesToday ?? 0}</p>
              <span className="text-[10px] text-[#6B6B6B]">Sent in last 24 hours</span>
            </div>

            <div className="bg-white border border-[#F2C202]/40 p-5 rounded-2xl space-y-1 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A7300] block">Active Users</span>
              <p className="text-2xl font-black text-[#8A7300]">{stats?.activeUsersCount ?? 0}</p>
              <span className="text-[10px] text-[#6B6B6B]">Communicating staff</span>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="bg-white border border-[#EAEAEA] p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-[#111111] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#8A7300]" /> Global Company Message Search
            </h3>
            <p className="text-xs text-[#6B6B6B]">
              Search across all internal messages by text, block number, shipment ID, or staff name.
            </p>

            <form onSubmit={handleGlobalSearch} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter search terms, block #, shipment #..."
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                className="flex-1 bg-[#F7F7F5] border border-[#EAEAEA] text-[#111111] text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-[#F2C202]"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 bg-[#F2C202] hover:bg-[#D8AD02] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-sm shrink-0"
              >
                {isSearching ? "Searching..." : "Search All Messages"}
              </button>
            </form>

            {hasSearched && !isSearching && searchResults.length === 0 && (
              <p className="text-xs text-[#6B6B6B] text-center py-4">No messages matched "{globalQuery}".</p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
                <h4 className="text-xs font-semibold text-[#6B6B6B]">Matching Results ({searchResults.length}):</h4>
                {searchResults.map((res) => (
                  <div
                    key={res.id}
                    onClick={() => handleInspectConversation(res.conversationId)}
                    className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl hover:border-[#F2C202]/60 cursor-pointer transition flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#111111]">{res.senderName}</span>
                        <span className="text-[10px] text-[#6B6B6B] bg-white border border-[#EAEAEA] px-1.5 py-0.5 rounded font-mono">
                          {res.conversationName}
                        </span>
                        {res.blockId && (
                          <span className="text-[10px] text-[#8A7300] bg-[#F2C202]/10 border border-[#F2C202]/30 px-1.5 py-0.5 rounded font-mono">
                            Block #{res.blockId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#111111] line-clamp-2">{res.content}</p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#6B6B6B] shrink-0">
                      <span className="hidden sm:inline" suppressHydrationWarning>{formatMessageDate(res.createdAt)}</span>
                      <ChevronRight className="w-4 h-4 text-[#8A7300]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Conversations Overview */}
          <div className="bg-white border border-[#EAEAEA] p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-[#111111]">All Company Conversations</h3>
            <div className="divide-y divide-[#EAEAEA] overflow-hidden">
              {conversations.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#6B6B6B]">No conversations yet.</p>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleInspectConversation(c.id)}
                    className="py-3.5 px-2 flex items-center justify-between gap-3 hover:bg-[#F7F7F5] cursor-pointer rounded-xl transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl text-[#8A7300] font-bold text-xs shrink-0">
                        {c.type === "GROUP" ? <Users className="w-4 h-4" /> : c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-[#111111]">{c.name}</h4>
                          <span className="px-2 py-0.5 text-[10px] bg-[#F7F7F5] border border-[#EAEAEA] text-[#6B6B6B] rounded-md">
                            {c.type}
                          </span>
                          {c.blockId && (
                            <span className="px-2 py-0.5 text-[10px] bg-[#F2C202]/10 text-[#8A7300] border border-[#F2C202]/30 rounded-md">
                              Block #{c.blockId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6B6B6B] mt-0.5 line-clamp-1">
                          {c.lastMessage ? c.lastMessage.content : "No messages"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="hidden sm:inline text-xs text-[#6B6B6B]" suppressHydrationWarning>
                        {formatMessageDate(c.lastMessageAt || c.createdAt)}
                      </span>
                      <button className="p-2 bg-[#F2C202]/10 text-[#8A7300] hover:bg-[#F2C202]/20 rounded-lg transition">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Super Admin Full Chat Inspection Interface */
        <ChatClient session={session} initialConversations={conversations} initialActiveId={inspectedConvId || undefined} />
      )}
    </div>
  );
}
