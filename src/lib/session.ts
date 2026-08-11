import { cookies } from "next/headers";

export type UserRole = "SUPER_ADMIN" | "WAREHOUSE_MANAGER" | "DEALER" | "VIEWER";

export interface SessionContext {
  role: UserRole;
  dealerId?: string;
  warehouseId?: string;
}

export async function getSessionContext(): Promise<SessionContext> {
  // If running in browser client context
  if (typeof window !== "undefined") {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return undefined;
    };
    
    return {
      role: (getCookie("prestige_role") as UserRole) || "SUPER_ADMIN",
      dealerId: getCookie("prestige_dealer_id"),
      warehouseId: getCookie("prestige_warehouse_id"),
    };
  }

  // Server-side context
  try {
    const cookieStore = await cookies();
    const role = (cookieStore.get("prestige_role")?.value as UserRole) || "SUPER_ADMIN";
    const dealerId = cookieStore.get("prestige_dealer_id")?.value || undefined;
    const warehouseId = cookieStore.get("prestige_warehouse_id")?.value || undefined;

    return { role, dealerId, warehouseId };
  } catch (err) {
    // Fallback if headers/cookies are unavailable during static render
    return { role: "SUPER_ADMIN" };
  }
}

export async function setSessionContext(context: Partial<SessionContext>) {
  if (typeof window !== "undefined") {
    if (context.role) {
      document.cookie = `prestige_role=${context.role}; path=/; max-age=31536000; SameSite=Lax`;
    }
    if (context.dealerId !== undefined) {
      document.cookie = `prestige_dealer_id=${context.dealerId}; path=/; max-age=31536000; SameSite=Lax`;
    }
    if (context.warehouseId !== undefined) {
      document.cookie = `prestige_warehouse_id=${context.warehouseId}; path=/; max-age=31536000; SameSite=Lax`;
    }
    return;
  }

  const cookieStore = await cookies();
  if (context.role) {
    cookieStore.set("prestige_role", context.role, { path: "/", maxAge: 31536000 });
  }
  if (context.dealerId !== undefined) {
    cookieStore.set("prestige_dealer_id", context.dealerId, { path: "/", maxAge: 31536000 });
  }
  if (context.warehouseId !== undefined) {
    cookieStore.set("prestige_warehouse_id", context.warehouseId, { path: "/", maxAge: 31536000 });
  }
}
