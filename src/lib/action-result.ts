import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/permissions";

/**
 * The shape every mutating server action returns.
 *
 * Server actions must not communicate failure by throwing: Next.js replaces a
 * thrown error's message with an opaque digest in production builds, so the
 * operator would see "An unexpected error occurred" instead of "Insufficient
 * available stock — only 4 boxes are available". Returning the outcome keeps
 * the real message (spec §29) while still hiding anything internal.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, code = "ERROR"): ActionResult<never> {
  return { ok: false, error, code };
}

/**
 * Runs an action body and converts any failure into a safe, useful message.
 *
 * `AppError` carries text written for the operator, so it is passed through.
 * Anything else — a Prisma error, a connection failure, a bug — is logged
 * server-side and reported generically; database internals and stack traces
 * must never reach the browser (spec §29).
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err: any) {
    if (err instanceof AppError) {
      return { ok: false, error: err.message, code: err.code };
    }

    console.error("[ACTION ERROR]", err);

    // Prisma failures that have a meaningful operator-facing equivalent.
    const prismaCode = err?.code;
    if (prismaCode === "P2002") {
      return { ok: false, error: "That record already exists.", code: "DUPLICATE" };
    }
    if (prismaCode === "P2025") {
      return { ok: false, error: "That record no longer exists.", code: "NOT_FOUND" };
    }
    // P2028 = transaction API error, P2024 = connection pool timeout, P2034 =
    // write conflict / deadlock. A transaction that expires mid-raw-query
    // surfaces as a plain error with no code, so the message is matched too —
    // otherwise "Transaction already closed: …" reached the operator verbatim.
    if (
      prismaCode === "P2028" ||
      prismaCode === "P2024" ||
      prismaCode === "P2034" ||
      /transaction already closed|expired transaction|deadlock|could not serialize/i.test(
        String(err?.message)
      )
    ) {
      return {
        ok: false,
        error: "The system is busy right now. Please try that again.",
        code: "BUSY",
      };
    }
    if (
      err?.name === "PrismaClientInitializationError" ||
      /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(String(err?.message))
    ) {
      return {
        ok: false,
        error: "Connection failed. Please check your network and try again.",
        code: "CONNECTION",
      };
    }

    return { ok: false, error: "Something went wrong. Please try again.", code: "UNKNOWN" };
  }
}

/**
 * Every route that renders block or stock data.
 *
 * The same pages are mounted under each role's path prefix (`/admin/blocks`,
 * `/showroom-staff/blocks`, …) and re-export the shared component. Revalidating
 * only `/blocks` left every role-prefixed copy stale, which is why a completed
 * approval appeared to do nothing until a manual reload.
 */
const ROLE_PREFIXES = ["", "/admin", "/warehouse", "/showroom-staff", "/showroom-incharge", "/viewer"];

export function revalidateBlockViews(blockId?: string) {
  for (const prefix of ROLE_PREFIXES) {
    revalidatePath(`${prefix}/blocks`);
    revalidatePath(`${prefix}/inventory`);
    revalidatePath(`${prefix}/dashboard`);
    revalidatePath(`${prefix}/in-transit`);
    revalidatePath(`${prefix}/shipments`);
    revalidatePath(`${prefix}/transit`);
    if (blockId) revalidatePath(`${prefix}/blocks/${blockId}`);
  }
}

export function revalidateProcurementViews(shipmentId?: string) {
  for (const prefix of ROLE_PREFIXES) {
    revalidatePath(`${prefix}/procurement`);
    revalidatePath(`${prefix}/procurement/need-to-order`);
    revalidatePath(`${prefix}/procurement/orders`);
    revalidatePath(`${prefix}/blocks`);
    revalidatePath(`${prefix}/inventory`);
    revalidatePath(`${prefix}/dashboard`);
    if (shipmentId) revalidatePath(`${prefix}/procurement/orders/${shipmentId}`);
  }
}

export function revalidateBookingViews(bookingId?: string) {
  for (const prefix of ROLE_PREFIXES) {
    revalidatePath(`${prefix}/bookings`);
    revalidatePath(`${prefix}/inventory`);
    revalidatePath(`${prefix}/dashboard`);
    if (bookingId) revalidatePath(`${prefix}/bookings/${bookingId}`);
  }
}
