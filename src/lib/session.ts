import { getEffectiveSession } from "./auth";
import { isRole, type Role } from "./permissions";

export type UserRole = Role;

export interface SessionContext {
  role: UserRole;
  /** False when nobody is signed in — callers must not render private data. */
  authenticated: boolean;
  dealerId?: string;
  warehouseId?: string;
  showroomId?: string;
  userId?: string;
  email?: string;
  name?: string;
  isPreview?: boolean;
}

/**
 * Server-side session for page components.
 *
 * Reads exclusively from the signed session cookie. The previous
 * implementation fell back to the `prestige_role` cookie, which the browser
 * can set — visiting the site with `document.cookie = "prestige_role=
 * SUPER_ADMIN"` was enough to be treated as an administrator. There is now no
 * path by which client-supplied role data reaches an authorization decision.
 *
 * An unauthenticated caller gets the least-privileged role and
 * `authenticated: false`; pages redirect on that rather than rendering data.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const session = await getEffectiveSession();

  if (!session || !isRole(session.role)) {
    return { role: "WEAVER", authenticated: false };
  }

  return {
    role: session.role,
    authenticated: true,
    dealerId: session.dealerId,
    warehouseId: session.warehouseId,
    showroomId: session.showroomId,
    userId: session.userId,
    email: session.email,
    name: session.name,
    isPreview: session.isPreview,
  };
}
