import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { AppError, isRole, type Role } from "@/lib/permissions";

/**
 * The signing secret is required — there is deliberately no fallback value.
 * A default secret means every deployment that forgets to set JWT_SECRET
 * shares a publicly-known key, which is the same as having no authentication
 * at all (spec §34).
 */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start with an insecure fallback signing key."
  );
}
const SECRET: string = JWT_SECRET;

export const SESSION_COOKIE_NAME = "prestige_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  dealerId?: string;
  warehouseId?: string;
  showroomId?: string;
  previewRole?: string; // Super Admin preview mode only
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
  try {
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    cookieStore.set("prestige_role", payload.role, { path: "/", maxAge: SESSION_MAX_AGE });
    for (const [name, value] of [
      ["prestige_dealer_id", payload.dealerId],
      ["prestige_warehouse_id", payload.warehouseId],
      ["prestige_showroom_id", payload.showroomId],
    ] as const) {
      if (value) {
        cookieStore.set(name, value, { path: "/", maxAge: SESSION_MAX_AGE });
      } else {
        cookieStore.delete(name);
      }
    }
  } catch {
    /* Outside HTTP request context (e.g. CLI test scripts) */
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const decoded = jwt.verify(token, SECRET) as SessionPayload;
    if (!decoded?.userId || !isRole(decoded.role)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function updateSessionPreview(previewRole?: string): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const cookieStore = await cookies();
  const updatedPayload: SessionPayload = { ...session, previewRole };
  // `exp` from the decoded token would otherwise clash with expiresIn.
  delete (updatedPayload as any).exp;
  delete (updatedPayload as any).iat;

  const token = jwt.sign(updatedPayload, SECRET, { expiresIn: "7d" });
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  cookieStore.set("prestige_role", previewRole || session.role, { path: "/", maxAge: SESSION_MAX_AGE });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete("prestige_role");
  cookieStore.delete("prestige_dealer_id");
  cookieStore.delete("prestige_warehouse_id");
  cookieStore.delete("prestige_showroom_id");
}

export interface EffectiveSession extends SessionPayload {
  role: string;
  isPreview: boolean;
  actualRole: string;
}

/**
 * Session with the Super Admin's simulated role applied.
 *
 * Reads only — cheap, no database round trip. Mutations must use
 * `requireUser()` below, which re-reads the live user record.
 */
export async function getEffectiveSession(): Promise<EffectiveSession | null> {
  const session = await getSession();
  if (!session) return null;

  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const previewValid = isSuperAdmin && !!session.previewRole && isRole(session.previewRole);
  const effectiveRole = previewValid ? (session.previewRole as string) : session.role;

  return {
    ...session,
    role: effectiveRole,
    isPreview: previewValid,
    actualRole: session.role,
  };
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  /** Effective role — the preview role when a Super Admin is simulating. */
  role: Role;
  /** The role actually stored on the user record. */
  actualRole: Role;
  isPreview: boolean;
  showroomId: string | null;
  warehouseId: string | null;
  dealerId: string | null;
}

/**
 * The authorization entry point for every mutation.
 *
 * Verifies the signed session, then re-reads the user from the database so
 * role changes, deactivations and showroom re-assignments take effect
 * immediately instead of lingering for the seven-day life of a token. One
 * primary-key lookup is a fair price for not honouring a stale role.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await getSession();
  if (!session) {
    throw new AppError("Please sign in to continue.", 401, "UNAUTHENTICATED");
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      showroomId: true,
      warehouse_id: true,
      dealer_id: true,
    },
  });

  if (!user) {
    throw new AppError("Your account no longer exists.", 401, "UNAUTHENTICATED");
  }
  if (user.status !== "ACTIVE" && user.status !== "INVITED") {
    throw new AppError("Your account is not active.", 403, "ACCOUNT_INACTIVE");
  }

  const actualRole = user.role as Role;
  const previewValid =
    actualRole === "SUPER_ADMIN" && !!session.previewRole && isRole(session.previewRole);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: previewValid ? (session.previewRole as Role) : actualRole,
    actualRole,
    isPreview: previewValid,
    showroomId: user.showroomId,
    warehouseId: user.warehouse_id,
    dealerId: user.dealer_id,
  };
}
