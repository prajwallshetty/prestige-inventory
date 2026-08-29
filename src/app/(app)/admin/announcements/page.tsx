import React from "react";
import { getEffectiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AnnouncementsClient } from "@/components/admin/AnnouncementsClient";

import { getAnnouncementsHistory } from "@/services/NotificationService";

export const revalidate = 0;

export default async function AdminAnnouncementsPage() {
  const session = await getEffectiveSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  // Independent reads — parallel rather than sequential (each round trip to
  // the database costs ~2s here, see docs/AUDIT.md J1).
  const [announcements, dealers, showrooms, warehouses] = await Promise.all([
    getAnnouncementsHistory(20),
    db.dealer.findMany({ orderBy: { name: "asc" } }),
    db.showroom.findMany({ orderBy: { name: "asc" } }),
    db.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black uppercase tracking-wider text-[#111111]">
          Broadcasting Center
        </h1>
        <p className="text-xs text-[#6B6B6B]">
          Draft and dispatch system-wide or scoped push alerts and notifications to system partners.
        </p>
      </div>

      <AnnouncementsClient 
        initialAnnouncements={announcements}
        dealers={dealers}
        warehouses={warehouses}
        showrooms={showrooms}
        session={session}
      />
    </div>
  );
}
