import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "prestige_session";

const ROLES = ["SUPER_ADMIN", "MANAGER", "WEAVER", "SHOWROOM_INCHARGE", "SHOWROOM_STAFF"] as const;
type Role = (typeof ROLES)[number];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    "="
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToString(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

/**
 * Verifies the HS256 session token using Web Crypto.
 *
 * The previous implementation only base64-decoded the payload, so a token
 * assembled by hand — any role, any expiry — passed route protection. The
 * Edge runtime cannot load `jsonwebtoken`, hence the manual HMAC check rather
 * than an extra dependency.
 */
async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(base64UrlToString(headerB64));
    if (header?.alg !== "HS256") return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlToString(payloadB64));
    if (payload?.exp && payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Landing route for each role after sign-in. */
function homeFor(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    case "MANAGER":
      return "/warehouse/dashboard";
    case "SHOWROOM_STAFF":
      return "/showroom-staff/dashboard";
    case "SHOWROOM_INCHARGE":
      return "/showroom-incharge/dashboard";
    default:
      return "/viewer/dashboard";
  }
}

/**
 * Section access. Keys are path prefixes; values are the roles allowed in.
 * Shared sections (/blocks, /inventory, …) are reachable by every signed-in
 * role — what may be *done* there is decided by the permission layer, not here.
 */
const SECTION_ACCESS: Array<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/dealer", roles: ["SUPER_ADMIN"] },
  { prefix: "/warehouse", roles: ["SUPER_ADMIN", "MANAGER"] },
  { prefix: "/manager", roles: ["SUPER_ADMIN", "MANAGER"] },
  { prefix: "/showroom-staff", roles: ["SUPER_ADMIN", "SHOWROOM_STAFF"] },
  { prefix: "/showroom-incharge", roles: ["SUPER_ADMIN", "SHOWROOM_INCHARGE"] },
  { prefix: "/system", roles: ["SUPER_ADMIN", "MANAGER"] },
  { prefix: "/users", roles: ["SUPER_ADMIN"] },
  { prefix: "/warehouses", roles: ["SUPER_ADMIN", "MANAGER"] },
  { prefix: "/viewer", roles: ROLES },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail closed: without a secret no token can be trusted.
    return new NextResponse("Server misconfigured: JWT_SECRET is not set.", { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyJwt(token, secret) : null;
  const actualRole: Role | null = isRole(session?.role) ? session!.role : null;
  const isAuth = !!session && !!actualRole;

  if (!isAuth) {
    // The sign-in page itself must stay reachable, or the redirect below
    // bounces against itself forever.
    if (pathname === "/login") return NextResponse.next();

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Signed in and asking for the login page or the bare root.
  if (pathname === "/login" || pathname === "/") {
    return NextResponse.redirect(new URL(homeFor(actualRole!), request.url));
  }

  for (const { prefix, roles } of SECTION_ACCESS) {
    // `/dealers` must not match the `/dealer` rule.
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && !roles.includes(actualRole!)) {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Every route except Next internals, static assets, the public API and the
     * PWA shell. The previous matcher listed only the role-prefixed sections,
     * leaving /blocks, /inventory, /bookings, /dealers, /in-transit, /reports
     * and /warehouses reachable without signing in.
     */
    "/((?!_next/|static/|api/v1/public|api/v1/cron|manifest.webmanifest|sw\\.js|offline|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)",
  ],
};
