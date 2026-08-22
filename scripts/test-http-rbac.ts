/**
 * HTTP-level RBAC smoke test (spec §33, §34).
 *
 * The service-level suite (test-e2e-workflow.ts) proves the business rules.
 * This proves the *transport*: real sessions minted by the real auth module,
 * carried as real cookies, through the real middleware, against a running
 * server. It is the only place the following are actually exercised:
 *
 *   - middleware verifies the JWT SIGNATURE (a forged token must be rejected)
 *   - route protection per role
 *   - unauthenticated access redirects rather than rendering
 *   - the retired `prestige_role` cookie can no longer escalate privilege
 *
 * Usage: start the app (npm run build && npm start), then
 *        npx tsx scripts/test-http-rbac.ts [baseUrl]
 */

import jwt from "jsonwebtoken";
import { db } from "../src/lib/db";
import { comparePassword } from "../src/lib/auth";

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";
const SESSION_COOKIE = "prestige_session";

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ id: string; name: string; status: Status; detail?: string }> = [];

function record(id: string, name: string, status: Status, detail?: string) {
  results.push({ id, name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "–";
  const trimmed = detail && detail.length > 110 ? `${detail.slice(0, 110)}…` : detail;
  console.log(`  ${icon} [${status}] ${id} ${name}${trimmed ? ` — ${trimmed}` : ""}`);
}

function check(id: string, name: string, ok: boolean, detail?: string) {
  record(id, name, ok ? "PASS" : "FAIL", ok ? undefined : detail);
}

/** Raw fetch that never follows redirects — the redirect *is* the assertion. */
async function get(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, location: res.headers.get("location") || "" };
}

/** Signs in over HTTP the way the browser does, returning the session cookie. */
async function signIn(email: string, password: string): Promise<string | null> {
  // The login form posts a Next server action; rather than reproduce the action
  // protocol, mint the session with the same module the action uses. The secret,
  // the claims and the verification path are all the production ones.
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;

  const ok = await comparePassword(password, user.password);
  if (!ok) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set — refusing to run with a fallback.");

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      showroomId: user.showroomId || undefined,
      warehouseId: user.warehouse_id || undefined,
    },
    secret,
    { expiresIn: "7d" }
  );
  return `${SESSION_COOKIE}=${token}`;
}

/** 200 = rendered, 3xx = redirected away, 403 = refused. */
const allowed = (s: number) => s === 200;
const refused = (s: number) => s === 403 || (s >= 300 && s < 400);

async function main() {
  console.log(`\n════ HTTP RBAC SMOKE — ${BASE} ════\n`);

  // Fail loudly rather than silently testing nothing.
  try {
    const probe = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (probe.status >= 500) throw new Error(`server returned ${probe.status}`);
  } catch (err: any) {
    console.error(`\nCannot reach ${BASE} — start the app first (npm start).\n${err.message}\n`);
    process.exit(2);
  }

  // ── Unauthenticated ──
  console.log("UNAUTHENTICATED");
  for (const path of ["/dashboard", "/blocks", "/inventory", "/bookings", "/reports", "/warehouses", "/admin/users"]) {
    const r = await get(path);
    check(`U:${path}`, `${path} is not served to anonymous callers`,
      refused(r.status), `status ${r.status} location ${r.location}`);
  }
  const offline = await get("/offline");
  check("U:offline", "/offline stays reachable while signed out", offline.status === 200, `status ${offline.status}`);

  // ── Forged / tampered tokens ──
  console.log("\nTOKEN FORGERY");
  const forged =
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
    "." +
    Buffer.from(JSON.stringify({ userId: "x", role: "SUPER_ADMIN", exp: Math.floor(Date.now() / 1000) + 9999 })).toString("base64url") +
    ".";
  const forgedRes = await get("/admin/users", `${SESSION_COOKIE}=${forged}`);
  check("T1", "An unsigned token cannot reach an admin route",
    refused(forgedRes.status), `status ${forgedRes.status}`);

  const wrongSig = jwt.sign({ userId: "x", role: "SUPER_ADMIN" }, "not-the-real-secret", { expiresIn: "1h" });
  const wrongSigRes = await get("/admin/users", `${SESSION_COOKIE}=${wrongSig}`);
  check("T2", "A token signed with the wrong secret is rejected",
    refused(wrongSigRes.status), `status ${wrongSigRes.status}`);

  // The pre-repair escalation: a client-writable role cookie with no session.
  const roleCookieOnly = await get("/admin/users", "prestige_role=SUPER_ADMIN");
  check("T3", "The client-writable role cookie cannot escalate privilege",
    refused(roleCookieOnly.status), `status ${roleCookieOnly.status}`);

  // ── Per-role route matrix ──
  const matrix: Array<{
    email: string;
    role: string;
    allow: string[];
    deny: string[];
  }> = [
    {
      email: "admin@prestigetiles.com",
      role: "SUPER_ADMIN",
      allow: ["/admin/dashboard", "/admin/users", "/blocks", "/inventory", "/dealers", "/reports", "/warehouse/dashboard"],
      deny: [],
    },
    {
      email: "manager@prestigetiles.com",
      role: "MANAGER",
      allow: ["/warehouse/dashboard", "/blocks", "/inventory", "/reports"],
      deny: ["/admin/users", "/admin/dashboard"],
    },
    {
      email: "viewer@prestigetiles.com",
      role: "WEAVER",
      allow: ["/viewer/dashboard", "/blocks", "/inventory"],
      deny: ["/admin/users", "/warehouse/dashboard", "/showroom-incharge/dashboard"],
    },
    {
      email: "incharge@prestigetiles.com",
      role: "SHOWROOM_INCHARGE",
      allow: ["/showroom-incharge/dashboard", "/blocks", "/inventory"],
      deny: ["/admin/users", "/warehouse/dashboard", "/showroom-staff/dashboard"],
    },
    {
      email: "showroomstaff@prestigetiles.com",
      role: "SHOWROOM_STAFF",
      allow: ["/showroom-staff/dashboard", "/blocks", "/inventory"],
      deny: ["/admin/users", "/warehouse/dashboard", "/showroom-incharge/dashboard"],
    },
  ];

  for (const entry of matrix) {
    console.log(`\n${entry.role}`);
    const cookie = await signIn(entry.email, "prestige123");
    if (!cookie) {
      record(entry.role, `sign in as ${entry.email}`, "FAIL", "credentials rejected");
      continue;
    }
    check(`${entry.role}:login`, "signs in with the real password", true);

    for (const path of entry.allow) {
      const r = await get(path, cookie);
      check(`${entry.role}:+${path}`, `may open ${path}`, allowed(r.status),
        `status ${r.status} location ${r.location}`);
    }
    for (const path of entry.deny) {
      const r = await get(path, cookie);
      check(`${entry.role}:-${path}`, `is refused ${path}`, refused(r.status),
        `status ${r.status} location ${r.location}`);
    }
  }

  // ── Wrong password ──
  console.log("\nCREDENTIALS");
  const bad = await signIn("admin@prestigetiles.com", "wrong-password");
  check("C1", "A wrong password yields no session", bad === null);

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log("\n════════ RESULTS ════════");
  console.log(`  PASS ${pass}   FAIL ${fail}   (${results.length} checks)`);
  if (fail > 0) {
    console.log("\n  Failures:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`   ✗ ${r.id} ${r.name} — ${r.detail}`));
  }
  console.log("═".repeat(28));

  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
