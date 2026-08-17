/**
 * Dealer management (Phase 2). Super Admin only — callers must enforce that
 * via `canManageDealers` before invoking these.
 *
 * Dealer identifiers look like `2026/PR1/0001`: year, Super-Admin-assigned
 * short code, then a per-code running number. The number is allocated inside
 * the creating transaction so two simultaneous creations can never collide.
 */
import { db } from "@/lib/db";
import { invalidateCache } from "@/lib/redis";

/** Same reasoning as the block service: the database is a region away. */
const DEALER_TX_OPTIONS = { timeout: 30_000, maxWait: 20_000 } as const;

/** Codes are short, uppercase and alphanumeric — they appear inside the ID. */
export function normaliseDealerCode(code: string): string {
  return (code || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidDealerCode(code: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(code);
}

/** Renders what an ID will look like, for the create form's live preview. */
export function previewDealerId(code: string, year = new Date().getFullYear()): string {
  const c = normaliseDealerCode(code) || "____";
  return `${year}/${c}/0001`;
}

function formatDealerId(year: number, code: string, n: number): string {
  return `${year}/${code}/${String(n).padStart(4, "0")}`;
}

/**
 * Allocates the next dealer ID for a code. Must run inside a transaction —
 * the upsert+increment is what makes concurrent creation safe.
 */
async function nextDealerId(tx: any, code: string, year: number): Promise<string> {
  const row = await tx.dealerSequence.upsert({
    where: { year_dealerCode: { year, dealerCode: code } },
    update: { lastNumber: { increment: 1 } },
    create: { year, dealerCode: code, lastNumber: 1 },
  });
  return formatDealerId(year, code, row.lastNumber);
}

export async function createDealer({
  name,
  dealerCode,
  contact,
  phone,
  email,
  address,
  company,
  showroomId,
  status = "ACTIVE",
  createdById,
  createdByName,
}: {
  name: string;
  dealerCode: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company?: string | null;
  showroomId?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  createdById?: string | null;
  createdByName?: string;
}) {
  const code = normaliseDealerCode(dealerCode);
  if (!name?.trim()) throw new Error("Dealer name is required.");
  if (!isValidDealerCode(code)) {
    throw new Error("Dealer code must be 2-6 letters or digits, e.g. PR1.");
  }

  const year = new Date().getFullYear();

  const dealer = await db.$transaction(async (tx) => {
    if (email?.trim()) {
      const clash = await tx.dealer.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (clash) throw new Error("A dealer with that email already exists.");
    }

    const dealerId = await nextDealerId(tx, code, year);

    const created = await tx.dealer.create({
      data: {
        dealerId,
        dealerCode: code,
        name: name.trim(),
        company: company?.trim() || null,
        contact: contact?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        address: address?.trim() || null,
        showroomId: showroomId || null,
        status,
        createdById: createdById || null,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE_DEALER",
        entity: "Dealer",
        entityId: created.id,
        userId: createdById || null,
        newValue: { dealerId, dealerCode: code, name: created.name, status },
        meta: { performedBy: createdByName || "Super Admin", generatedDealerId: dealerId },
      },
    });

    return created;
  }, DEALER_TX_OPTIONS);

  await invalidateCache("dealers:*");
  return dealer;
}

export async function updateDealer({
  id,
  name,
  contact,
  phone,
  email,
  address,
  company,
  showroomId,
  status,
  updatedById,
  updatedByName,
}: {
  id: string;
  name?: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company?: string | null;
  showroomId?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  updatedById?: string | null;
  updatedByName?: string;
}) {
  const existing = await db.dealer.findUnique({ where: { id } });
  if (!existing) throw new Error("Dealer not found.");

  if (email?.trim() && email.trim().toLowerCase() !== existing.email) {
    const clash = await db.dealer.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (clash) throw new Error("A dealer with that email already exists.");
  }

  const updated = await db.dealer.update({
    where: { id },
    data: {
      // dealerId and dealerCode are intentionally immutable: the identifier is
      // referenced by blocks and printed on paperwork, so re-coding a dealer
      // would silently rewrite history.
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(company !== undefined ? { company: company?.trim() || null } : {}),
      ...(contact !== undefined ? { contact: contact?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      ...(email !== undefined ? { email: email?.trim().toLowerCase() || null } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(showroomId !== undefined ? { showroomId: showroomId || null } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE_DEALER",
      entity: "Dealer",
      entityId: id,
      userId: updatedById || null,
      oldValue: { name: existing.name, status: existing.status, email: existing.email },
      newValue: { name: updated.name, status: updated.status, email: updated.email },
      meta: { performedBy: updatedByName || "Super Admin" },
    },
  });

  await invalidateCache("dealers:*");
  return updated;
}

/**
 * Deactivates a dealer. Never deletes: blocks reference dealerId and the
 * history must stay intact.
 */
export async function setDealerStatus({
  id,
  status,
  performedById,
  performedByName,
}: {
  id: string;
  status: "ACTIVE" | "INACTIVE";
  performedById?: string | null;
  performedByName?: string;
}) {
  const existing = await db.dealer.findUnique({ where: { id } });
  if (!existing) throw new Error("Dealer not found.");

  const updated = await db.dealer.update({ where: { id }, data: { status } });

  await db.auditLog.create({
    data: {
      action: status === "ACTIVE" ? "ACTIVATE_DEALER" : "DEACTIVATE_DEALER",
      entity: "Dealer",
      entityId: id,
      userId: performedById || null,
      oldValue: { status: existing.status },
      newValue: { status },
      meta: { performedBy: performedByName || "Super Admin" },
    },
  });

  await invalidateCache("dealers:*");
  return updated;
}

/** Dealer list with block counts, for the management table. */
export async function listDealers() {
  return db.dealer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      dealerId: true,
      dealerCode: true,
      name: true,
      company: true,
      contact: true,
      phone: true,
      email: true,
      address: true,
      status: true,
      createdAt: true,
      showroom: { select: { id: true, name: true } },
      _count: { select: { stockBlocks: true } },
    },
  });
}

/** Single dealer with its block history (spec §1: view dealer blocks/history). */
export async function getDealerDetail(id: string) {
  return db.dealer.findUnique({
    where: { id },
    include: {
      showroom: { select: { id: true, name: true } },
      stockBlocks: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          block_number: true,
          status: true,
          quantity: true,
          createdAt: true,
          requestedBy: true,
        },
      },
    },
  });
}
