import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "prestige_session";

// Base64Url decode helper for Edge runtime compatibility
function decodeJwt(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (err) {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes("manifest.json") ||
    pathname.includes("sw.js") ||
    pathname.includes("icon-") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico") ||
    pathname.startsWith("/api/v1/public") // Public API bypasses auth middleware
  ) {
    return NextResponse.next();
  }

  const tokenCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const token = tokenCookie?.value;
  const session = token ? decodeJwt(token) : null;

  const isAuth = !!session && (!session.exp || session.exp * 1000 > Date.now());

  // Determine actual role, respecting simulated preview roles for super admins
  const actualRole = session?.role || "VIEWER";
  const previewRole = session?.previewRole;
  const isSuperAdmin = actualRole === "SUPER_ADMIN";
  const role = (isSuperAdmin && previewRole) ? previewRole : actualRole;

  // Unauthenticated requests
  if (!isAuth) {
    // If requesting protected pages, redirect to login
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/warehouse") ||
      pathname.startsWith("/dealer") ||
      pathname.startsWith("/viewer") ||
      pathname === "/"
    ) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Authenticated requests requesting /login or /
  if (pathname === "/login" || pathname === "/") {
    if (actualRole === "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    if (actualRole === "MANAGER") {
      return NextResponse.redirect(new URL("/warehouse/dashboard", request.url));
    }
    if (actualRole === "DEALER") {
      return NextResponse.redirect(new URL("/dealer/dashboard", request.url));
    }
    if (actualRole === "SHOWROOM_STAFF") {
      return NextResponse.redirect(new URL("/showroom-staff/dashboard", request.url));
    }
    if (actualRole === "SHOWROOM_INCHARGE") {
      return NextResponse.redirect(new URL("/showroom-incharge/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/viewer/dashboard", request.url));
  }

  // Route protection rules:
  // 1. Admin paths (/admin/*) -> Only SUPER_ADMIN
  if (pathname.startsWith("/admin")) {
    if (actualRole !== "SUPER_ADMIN") {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  // 2. Warehouse/Manager paths -> SUPER_ADMIN or MANAGER
  if (pathname.startsWith("/warehouse") || pathname.startsWith("/manager")) {
    if (actualRole !== "SUPER_ADMIN" && actualRole !== "MANAGER") {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  // 3. Dealer paths (/dealer/*) -> Only DEALER role
  if (pathname.startsWith("/dealer")) {
    if (actualRole !== "DEALER") {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  // 4. Showroom Staff paths
  if (pathname.startsWith("/showroom-staff")) {
    if (actualRole !== "SUPER_ADMIN" && actualRole !== "SHOWROOM_STAFF") {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  // 5. Showroom In-Charge paths
  if (pathname.startsWith("/showroom-incharge")) {
    if (actualRole !== "SUPER_ADMIN" && actualRole !== "SHOWROOM_INCHARGE") {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  // 6. Viewer paths (/viewer/*) -> VIEWER, MANAGER, SHOWROOM_STAFF, SHOWROOM_INCHARGE, or SUPER_ADMIN
  if (pathname.startsWith("/viewer")) {
    if (
      actualRole !== "VIEWER" &&
      actualRole !== "MANAGER" &&
      actualRole !== "SHOWROOM_STAFF" &&
      actualRole !== "SHOWROOM_INCHARGE" &&
      actualRole !== "SUPER_ADMIN"
    ) {
      return new NextResponse("Unauthorized Access (403)", { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/admin/:path*",
    "/warehouse/:path*",
    "/manager/:path*",
    "/showroom-staff/:path*",
    "/showroom-incharge/:path*",
    "/dealer/:path*",
    "/viewer/:path*",
  ],
};
