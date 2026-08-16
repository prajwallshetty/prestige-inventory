"use client";

import React, { useState, useEffect } from "react";
import { Bell, Smartphone, ShieldCheck, Check } from "lucide-react";
import { toast } from "sonner";

interface PreferenceItem {
  id: string;
  label: string;
  description: string;
  inApp: boolean;
  push: boolean;
  locked?: boolean;
}

export function NotificationPreferencesForm() {
  const [preferences, setPreferences] = useState<PreferenceItem[]>([
    {
      id: "booking",
      label: "Booking Updates",
      description: "Alerts when stock bookings are approved, rejected, confirmed, or dispatched.",
      inApp: true,
      push: true,
    },
    {
      id: "expiry",
      label: "Reservation Expiry",
      description: "Warnings 2 hours prior to reservation expiration and release alerts.",
      inApp: true,
      push: true,
    },
    {
      id: "stock",
      label: "Stock & Inventory Alerts",
      description: "Notifications for low stock levels, restocks, and warehouse shipments.",
      inApp: true,
      push: false,
    },
    {
      id: "announcements",
      label: "Broadcast Announcements",
      description: "Important operational guidelines and general depot notices.",
      inApp: true,
      push: true,
    },
    {
      id: "system",
      label: "System Security & Administrative Alerts",
      description: "Critical security notifications and account status changes.",
      inApp: true,
      push: true,
      locked: true, // Critical security alerts cannot be disabled
    },
  ]);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
    }

    const saved = localStorage.getItem("prestige_notif_preferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences((prev) =>
          prev.map((item) => {
            const match = parsed.find((p: any) => p.id === item.id);
            return match ? { ...item, inApp: match.inApp, push: match.push } : item;
          })
        );
      } catch (err) {
        console.warn("Failed parsing saved notification preferences:", err);
      }
    }
  }, []);

  const requestPushPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === "granted") {
        toast.success("Browser Push Notifications enabled!");
      } else {
        toast.error("Push notification permission denied.");
      }
    }
  };

  const toggleInApp = (id: string) => {
    setPreferences((prev) =>
      prev.map((item) => {
        if (item.id === id && !item.locked) {
          return { ...item, inApp: !item.inApp };
        }
        return item;
      })
    );
  };

  const togglePush = (id: string) => {
    setPreferences((prev) =>
      prev.map((item) => {
        if (item.id === id && !item.locked) {
          return { ...item, push: !item.push };
        }
        return item;
      })
    );
  };

  const handleSave = () => {
    localStorage.setItem("prestige_notif_preferences", JSON.stringify(preferences));
    toast.success("Notification preferences saved successfully.");
  };

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-5 text-xs text-[#111111] font-sans">
      <div className="flex justify-between items-start border-b border-[#EAEAEA] pb-3">
        <div>
          <h3 className="text-sm font-black text-[#111111] uppercase tracking-wide flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#F2C202]" /> Notification Preferences
          </h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            Configure how and when you receive in-app and browser push notifications.
          </p>
        </div>
        {pushSupported && pushPermission !== "granted" && (
          <button
            onClick={requestPushPermission}
            className="flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-1.5 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5 text-[#F2C202]" /> Enable Web Push
          </button>
        )}
      </div>

      <div className="space-y-4">
        {preferences.map((item) => (
          <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 rounded-lg border border-[#F7F7F5] bg-[#F7F7F5]/50">
            <div className="space-y-0.5 max-w-md">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#111111]">{item.label}</span>
                {item.locked && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    <ShieldCheck className="h-2.5 w-2.5" /> Mandatory
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#6B6B6B] leading-relaxed">{item.description}</p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {/* In-App Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={item.locked}
                  checked={item.inApp}
                  onChange={() => toggleInApp(item.id)}
                  className="rounded border-[#EAEAEA] text-[#F2C202] focus:ring-[#F2C202]"
                />
                <span className="text-[10px] font-bold text-[#6B6B6B]">In-App</span>
              </label>

              {/* Web Push Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={item.locked || pushPermission !== "granted"}
                  checked={item.push}
                  onChange={() => togglePush(item.id)}
                  className="rounded border-[#EAEAEA] text-[#F2C202] focus:ring-[#F2C202]"
                />
                <span className="text-[10px] font-bold text-[#6B6B6B]">Browser Push</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all cursor-pointer shadow-xs"
        >
          <Check className="h-4 w-4" /> Save Notification Settings
        </button>
      </div>
    </div>
  );
}
