import React from "react";
import { db } from "@/lib/db";
import { UsersClient } from "./UsersClient";
import { getSessionContext } from "@/lib/session";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function UsersPage() {
  const session = await getSessionContext();

  // Protect page at page level in case middleware is bypassed
  if (session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  // Fetch all users, dealers, warehouses, and showrooms
  const [users, dealers, warehouses, showrooms] = await Promise.all([
    db.user.findMany({
      include: {
        dealer: { select: { name: true } },
        warehouse: { select: { name: true, code: true } },
        showroom: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.dealer.findMany({ select: { id: true, name: true } }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true } }),
    db.showroom.findMany({ select: { id: true, name: true } }),
  ]);

  const serializedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    dealer_id: u.dealer_id || undefined,
    warehouse_id: u.warehouse_id || undefined,
    showroomId: u.showroomId || undefined,
    dealerName: u.dealer?.name,
    warehouseName: u.warehouse ? `${u.warehouse.name} (${u.warehouse.code})` : undefined,
    showroomName: u.showroom?.name,
    lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
  }));

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">User Management Control</h1>
          <p className="text-xs text-[#6B6B6B]">
            Create new team members, reset passwords, deactivate accounts, and map dealer/warehouse roles.
          </p>
        </div>

        <UsersClient 
          users={serializedUsers} 
          dealers={dealers} 
          warehouses={warehouses} 
          showrooms={showrooms}
        />
      </div>
    </>
  );
}
