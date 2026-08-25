"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  MessageSquare,
  Users,
  Search,
  Lock,
  Truck,
  Eye,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { ChatClient } from "./ChatClient";

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" /> Super Admin Global Oversight
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Company Chat Monitor & Audit</h1>
          <p className="text-slate-400 text-sm mt-1">
            Administrative monitoring, audit trails, and global keyword search across all Prestige Tiles internal communications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("MONITOR")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === "MONITOR"
                ? "bg-amber-500 text-slate-950 shadow-md"
                : "bg-slate-800 text-slate-300 hover:text-white"
            }`}
          >
            Monitor Dashboard
          </button>
          <button
            onClick={() => setActiveTab("ALL_CHATS")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === "ALL_CHATS"
                ? "bg-amber-500 text-slate-950 shadow-md"
                : "bg-slate-800 text-slate-300 hover:text-white"
            }`}
          >
            All Company Conversations
          </button>
        </div>
      </div>

      {activeTab === "MONITOR" ? (
        <div className="space-y-6">
          {/* Stats Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Conversations</span>
              <p className="text-2xl font-black text-white">{stats?.totalConversations || conversations.length}</p>
              <span className="text-[10px] text-slate-400">Direct & Group operational channels</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Active Channels</span>
              <p className="text-2xl font-black text-indigo-400">{stats?.activeConversations || conversations.length}</p>
              <span className="text-[10px] text-slate-400">Currently active conversations</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Messages Today</span>
              <p className="text-2xl font-black text-emerald-400">{stats?.messagesToday || 0}</p>
              <span className="text-[10px] text-slate-400">Sent within last 24 hours</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Active Users</span>
              <p className="text-2xl font-black text-amber-400">{stats?.activeUsersCount || 0}</p>
              <span className="text-[10px] text-slate-400">Communicating internal staff</span>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" /> Global Company Message Search
            </h3>
            <p className="text-xs text-slate-400">
              Search across all internal messages by text, block number (e.g. BL-2026-00123), shipment ID, or staff name.
            </p>

            <form onSubmit={handleGlobalSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter search terms, block #, shipment #..."
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg"
              >
                {isSearching ? "Searching..." : "Search All Messages"}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                <h4 className="text-xs font-semibold text-slate-400">Matching Results ({searchResults.length}):</h4>
                {searchResults.map((res) => (
                  <div
                    key={res.id}
                    onClick={() => handleInspectConversation(res.conversationId)}
                    className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl hover:border-amber-500/50 cursor-pointer transition flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{res.senderName}</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded font-mono">
                          {res.conversationName}
                        </span>
                        {res.blockId && (
                          <span className="text-[10px] text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded font-mono">
                            Block #{res.blockId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{res.content}</p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(res.createdAt).toLocaleDateString()}</span>
                      <ChevronRight className="w-4 h-4 text-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Conversations Overview */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Active Company Conversations</h3>
            <div className="divide-y divide-slate-800/60 overflow-hidden">
              {conversations.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">No active conversations found.</p>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleInspectConversation(c.id)}
                    className="py-3.5 px-2 flex items-center justify-between hover:bg-slate-800/40 cursor-pointer rounded-xl transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-800 rounded-xl text-indigo-400 font-bold text-xs">
                        {c.type === "GROUP" ? <Users className="w-4 h-4" /> : c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white">{c.name}</h4>
                          <span className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded-md">
                            {c.type}
                          </span>
                          {c.blockId && (
                            <span className="px-2 py-0.5 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                              Block #{c.blockId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {c.lastMessage ? c.lastMessage.content : "No messages"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {new Date(c.lastMessageAt || c.createdAt).toLocaleDateString()}
                      </span>
                      <button className="p-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg transition">
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
