import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "prestige-super-secret-key-999-tiles-jwt";
const SESSION_COOKIE_NAME = "prestige_session";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  dealerId?: string;
  warehouseId?: string;
  showroomId?: string;
  previewRole?: string; // For super-admin preview mode
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  const cookieStore = await cookies();

  // Set HTTP-only, secure session cookie
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Also set legacy cookies for simulator backward compatibility if required
  cookieStore.set("prestige_role", payload.role, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  if (payload.dealerId) {
    cookieStore.set("prestige_dealer_id", payload.dealerId, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  } else {
    cookieStore.delete("prestige_dealer_id");
  }
  if (payload.warehouseId) {
    cookieStore.set("prestige_warehouse_id", payload.warehouseId, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  } else {
    cookieStore.delete("prestige_warehouse_id");
  }
  if (payload.showroomId) {
    cookieStore.set("prestige_showroom_id", payload.showroomId, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  } else {
    cookieStore.delete("prestige_showroom_id");
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload;
    return decoded;
  } catch (err) {
    return null;
  }
}

export async function updateSessionPreview(previewRole?: string): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const cookieStore = await cookies();
  const updatedPayload: SessionPayload = {
    ...session,
    previewRole,
  };
  const token = jwt.sign(updatedPayload, JWT_SECRET, { expiresIn: "7d" });
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  // Keep prestige_role cookie in sync for components reading getSessionContext
  if (previewRole) {
    cookieStore.set("prestige_role", previewRole, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  } else {
    cookieStore.set("prestige_role", session.role, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete("prestige_role");
  cookieStore.delete("prestige_dealer_id");
  cookieStore.delete("prestige_warehouse_id");
  cookieStore.delete("prestige_showroom_id");
}

/**
 * Gets a clean, role-swapped context if user is Super Admin in preview mode.
 */
export async function getEffectiveSession() {
  const session = await getSession();
  if (!session) return null;

  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const effectiveRole = (isSuperAdmin && session.previewRole) ? session.previewRole : session.role;

  return {
    ...session,
    role: effectiveRole,
    isPreview: isSuperAdmin && !!session.previewRole,
    actualRole: session.role,
  };
}
