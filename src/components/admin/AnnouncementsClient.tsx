"use client";

import React, { useState } from "react";
import { broadcastAnnouncementAction } from "@/app/actions";
import { 
  Megaphone, 
  Send, 
  Users, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  FileText
} from "lucide-react";

interface AnnouncementsClientProps {
  initialAnnouncements: any[];
  dealers: any[];
  warehouses: any[];
  showrooms: any[];
  session: any;
}

export function AnnouncementsClient({
  initialAnnouncements,
  dealers,
  warehouses,
  showrooms,
  session
}: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<any[]>(initialAnnouncements);
  
  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [audienceType, setAudienceType] = useState("ALL");
  const [audienceFilter, setAudienceFilter] = useState("");
  // Empty = send immediately / never expire. Both are datetime-local strings.
  const [scheduledAt, setScheduledAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert("You're offline. Reconnect to continue.");
      return;
    }
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const willSchedule = !!scheduledAt && new Date(scheduledAt).getTime() > Date.now();

      const data = await broadcastAnnouncementAction({
        title,
        message,
        priority,
        audienceType,
        audienceFilter: audienceType.startsWith("SPECIFIC_") ? audienceFilter : null,
        scheduledAt: scheduledAt || null,
        expiresAt: expiresAt || null,
      });

      setSuccess(
        willSchedule
          ? `Announcement scheduled for ${new Date(scheduledAt).toLocaleString()}. It will be delivered automatically.`
          : "Announcement broadcasted successfully! Recipients have been notified."
      );
      setAnnouncements((prev) => [
        {
          id: data.id,
          title,
          message,
          priority,
          audienceType,
          status: willSchedule ? "SCHEDULED" : "SENT",
          scheduledAt: scheduledAt || null,
          expiresAt: expiresAt || null,
          createdAt: new Date().toISOString(),
          createdBy: { name: session.name }
        },
        ...prev
      ]);

      // Clear form
      setTitle("");
      setMessage("");
      setPriority("NORMAL");
      setAudienceType("ALL");
      setAudienceFilter("");
      setScheduledAt("");
      setExpiresAt("");
    } catch (err: any) {
      setError(err.message || "Failed to broadcast announcement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityStyle = (p: string) => {
    if (p === "URGENT") return "bg-rose-100 text-rose-800 border-rose-200";
    if (p === "HIGH") return "bg-amber-100 text-amber-800 border-amber-200";
    if (p === "LOW") return "bg-slate-100 text-slate-800 border-slate-200";
    return "bg-blue-100 text-blue-800 border-blue-200";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans text-xs text-[#111111]">
      {/* BROADCAST FORM */}
      <div className="lg:col-span-1 rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-[#EAEAEA] pb-3">
          <Megaphone className="h-5 w-5 text-[#8A7300]" />
          <h2 className="text-sm font-black uppercase text-[#111111]">Broadcast Message</h2>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 flex gap-2 items-start text-rose-800 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex gap-2 items-start text-emerald-800 font-medium animate-pulse">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Announcement Title</label>
            <input
              type="text"
              required
              placeholder="e.g. System Downtime Notification"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Message Content</label>
            <textarea
              required
              rows={4}
              placeholder="Provide important operational guidelines or notification details..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Target Audience</label>
              <select
                value={audienceType}
                onChange={(e) => { setAudienceType(e.target.value); setAudienceFilter(""); }}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden font-bold"
              >
                <option value="ALL">All Portal Users</option>
                <option value="DEALERS">All Dealer Partners</option>
                <option value="MANAGERS">All Managers</option>
                <option value="SHOWROOM_STAFF">All Showroom Staff</option>
                <option value="SHOWROOM_INCHARGE">All Showroom In-Charges</option>
                <option value="SPECIFIC_DEALER">Specific Dealer</option>
                <option value="SPECIFIC_SHOWROOM">Specific Showroom</option>
                <option value="SPECIFIC_WAREHOUSE">Specific Warehouse</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden font-bold"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Red Alert)</option>
              </select>
            </div>
          </div>

          {/* Conditional target filters */}
          {audienceType === "SPECIFIC_DEALER" && dealers.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Select Dealer Partner</label>
              <select
                required
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden"
              >
                <option value="">Choose dealer...</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {audienceType === "SPECIFIC_SHOWROOM" && showrooms.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Select Showroom Origin</label>
              <select
                required
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden"
              >
                <option value="">Choose showroom...</option>
                {showrooms.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {audienceType === "SPECIFIC_WAREHOUSE" && warehouses.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Select Warehouse Depot</label>
              <select
                required
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden"
              >
                <option value="">Choose warehouse...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>
          )}

          {/* SCHEDULING — leaving these blank sends immediately, which keeps
              the default flow a single click. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#EAEAEA] pt-4">
            <div className="space-y-1">
              <label
                htmlFor="announcement-schedule"
                className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider"
              >
                Schedule Send
              </label>
              <input
                id="announcement-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
              />
              <p className="text-[9px] text-[#9A9A9A]">Leave blank to send now.</p>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="announcement-expiry"
                className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider"
              >
                Expires
              </label>
              <input
                id="announcement-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
              />
              <p className="text-[9px] text-[#9A9A9A]">Optional. Hides it after this time.</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting
              ? (scheduledAt ? "Scheduling..." : "Broadcasting...")
              : (scheduledAt ? "Schedule Broadcast" : "Broadcast Message")}
            {!isSubmitting && <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>

      {/* BROADCAST HISTORY */}
      <div className="lg:col-span-2 rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EAEAEA] pb-3">
          <Clock className="h-5 w-5 text-[#6B6B6B]" />
          <h2 className="text-sm font-black uppercase text-[#111111]">Broadcast History Logs</h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
              <tr>
                <th className="px-4 py-3">Announcement details</th>
                <th className="px-4 py-3">Audience Target</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Receipts (Read / Sent)</th>
                <th className="px-4 py-3">Sent At</th>
                <th className="px-4 py-3">Publisher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
              {announcements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                    No broadcast logs found.
                  </td>
                </tr>
              ) : (
                announcements.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#111111]">{a.title}</p>
                      <p className="text-[10px] text-[#6B6B6B] leading-relaxed mt-1">{a.message}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-[#F7F7F5] border border-[#EAEAEA] px-1.5 py-0.5 text-[9px] font-bold text-[#6B6B6B] uppercase font-mono tracking-wide">
                        {a.audienceType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${getPriorityStyle(a.priority)}`}>
                        {a.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const status = a.status || "SENT";
                        const style =
                          status === "SCHEDULED" ? "border-sky-200 bg-sky-50 text-sky-700"
                          : status === "EXPIRED" ? "border-[#EAEAEA] bg-[#F7F7F5] text-[#9A9A9A]"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700";
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${style}`}>
                              {status}
                            </span>
                            {status === "SCHEDULED" && a.scheduledAt && (
                              <span className="text-[9px] text-[#6B6B6B]">
                                for {new Date(a.scheduledAt).toLocaleString("en-IN", {
                                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(a.status || "SENT") === "SCHEDULED" ? (
                        <span className="text-[10px] italic text-[#9A9A9A]">Not yet delivered</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-[#111111]">
                            {a.readCount ?? 0} / {a.totalRecipients ?? a.recipients?.length ?? 0} read
                          </span>
                          <span className="text-[9px] text-[#6B6B6B]">
                            {((a.totalRecipients || a.recipients?.length) ?? 0) - ((a.readCount) ?? 0)} unread
                            {typeof a.readRate === "number" && ` · ${a.readRate}% read rate`}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#6B6B6B]">
                      {new Date(a.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-4 py-3 text-[#111111] font-bold">
                      {a.createdBy?.name || "System"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
