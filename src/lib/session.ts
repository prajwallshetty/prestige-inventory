import { cookies } from "next/headers";
import { getEffectiveSession, SessionPayload } from "./auth";

export type UserRole = "SUPER_ADMIN" | "MANAGER" | "VIEWER" | "SHOWROOM_INCHARGE" | "SHOWROOM_STAFF" | "DEALER";

export interface SessionContext {
  role: UserRole;
  dealerId?: string;
  warehouseId?: string;
  showroomId?: string;
  userId?: string;
  email?: string;
  name?: string;
  isPreview?: boolean;
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
      role: (getCookie("prestige_role") as UserRole) || "VIEWER",
      dealerId: getCookie("prestige_dealer_id"),
      warehouseId: getCookie("prestige_warehouse_id"),
      showroomId: getCookie("prestige_showroom_id"),
    };
  }

  // Server-side context
  try {
    const session = await getEffectiveSession();
    if (session) {
      return {
        role: session.role as UserRole,
        dealerId: session.dealerId,
        warehouseId: session.warehouseId,
        showroomId: session.showroomId,
        userId: session.userId,
        email: session.email,
        name: session.name,
        isPreview: session.isPreview,
      };
    }
    
    // Fallback if headers/cookies are unavailable during static render
    const cookieStore = await cookies();
    const role = (cookieStore.get("prestige_role")?.value as UserRole) || "VIEWER";
    const dealerId = cookieStore.get("prestige_dealer_id")?.value || undefined;
    const warehouseId = cookieStore.get("prestige_warehouse_id")?.value || undefined;
    const showroomId = cookieStore.get("prestige_showroom_id")?.value || undefined;

    return { role, dealerId, warehouseId, showroomId };
  } catch (err) {
    return { role: "VIEWER" };
  }
}
