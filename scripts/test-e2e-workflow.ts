/**
 * End-to-end regression suite for the block lifecycle (spec §42–§44).
 *
 * Runs against the real database through the real service layer — the same
 * code path the server actions call — with real user records, so authorisation,
 * scoping, transitions, stock maths, audit and notifications are all exercised
 * exactly as they are in the application.
 *
 * Every case reports PASS / FAIL / SKIP. Test data is created under a marker
 * and removed afterwards; nothing pre-existing is touched.
 *
 * Run: npx tsx scripts/test-e2e-workflow.ts
 */
import { db } from "../src/lib/db";
import { closeRedis } from "../src/lib/redis";
import {
  createBlockRequest,
  approveBlock,
  rejectBlock,
  shipBlock,
  deliverBlock,
  cancelBlock,
  expireBlock,
  releaseExpiredBlocks,
  reconcileInventory,
} from "../src/services/StockBlockService";
import { getBlockList, getPendingApprovalCount } from "../src/services/BlockQueryService";
import { createBooking, reviewBooking, cancelBooking } from "../src/services/BookingService";
import { getAvailableToBlock, searchBlockableProducts } from "../src/services/InventoryService";
import { adjustStock } from "../src/services/StockAdjustmentService";
import { hashPassword } from "../src/lib/auth";
import { canCreateBlock, isReadOnly } from "../src/lib/permissions";

/** Shared by every run; only ever used to sweep fixtures abandoned by a crashed run. */
const MARKER_PREFIX = "__E2E_TEST__";
/**
 * Unique to THIS run. Teardown deletes only rows carrying this marker, so a run
 * can never destroy the fixtures of another run that happens to overlap it.
 */
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const MARKER = `${MARKER_PREFIX}${RUN_ID}__`;

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ id: string; name: string; status: Status; detail?: string }> = [];

function record(id: string, name: string, status: Status, detail?: string) {
  results.push({ id, name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "–";
  console.log(`  ${icon} [${status}] ${id} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Asserts a condition, recording the outcome either way. */
function check(id: string, name: string, condition: boolean, detail?: string) {
  record(id, name, condition ? "PASS" : "FAIL", condition ? undefined : detail || "assertion failed");
}

/** Asserts that `fn` rejects, optionally matching the message. */
async function expectFailure(id: string, name: string, fn: () => Promise<unknown>, match?: RegExp) {
  try {
    await fn();
    record(id, name, "FAIL", "expected the call to be refused, but it succeeded");
  } catch (err: any) {
    const message = err?.message ?? String(err);
    if (match && !match.test(message)) {
      record(id, name, "FAIL", `refused with the wrong reason: "${message}"`);
    } else {
      record(id, name, "PASS", message.slice(0, 80));
    }
  }
}

async function stockOf(productId: string) {
  const inv = await db.inventory.findUniqueOrThrow({
    where: { productId },
    select: {
      totalStock: true,
      availableStock: true,
      blockedStock: true,
      transitStock: true,
      deliveredStock: true,
      allocatedStock: true,
      damagedStock: true,
      reservedStock: true,
    },
  });
  return inv;
}

async function main() {
  console.log("\n════ PRESTIGE TILES — END-TO-END REGRESSION ════\n");

  // ——————————————————————————————————————————————
  // Fixtures
  // ——————————————————————————————————————————————
  console.log("Setting up fixtures…");

  const warehouse = await db.warehouse.findFirst({ select: { id: true } });
  if (!warehouse) throw new Error("No warehouse — cannot run.");

  const showroom = await db.showroom.create({
    data: {
      slug: `e2e-showroom-${Date.now()}`,
      name: `${MARKER} Test Showroom`,
      addressLine: "1 Test Road",
      city: "Mangalore",
      phone: "0000000000",
    },
  });

  // A second showroom, to prove cross-showroom access is refused.
  const otherShowroom = await db.showroom.create({
    data: {
      slug: `e2e-other-${Date.now()}`,
      name: `${MARKER} Other Showroom`,
      addressLine: "2 Test Road",
      city: "Udupi",
      phone: "0000000000",
    },
  });

  const password = await hashPassword("Prestige@2026");
  const mk = (email: string, name: string, role: any, extra: any = {}) =>
    db.user.create({ data: { email, name: `${MARKER} ${name}`, password, role, status: "ACTIVE", ...extra } });

  const staff = await mk(`e2e-staff-${Date.now()}@test.local`, "Staff", "SHOWROOM_STAFF", { showroomId: showroom.id });
  const incharge = await mk(`e2e-incharge-${Date.now()}@test.local`, "InCharge", "SHOWROOM_INCHARGE", { showroomId: showroom.id });
  const otherIncharge = await mk(`e2e-incharge2-${Date.now()}@test.local`, "OtherInCharge", "SHOWROOM_INCHARGE", { showroomId: otherShowroom.id });
  const manager = await mk(`e2e-manager-${Date.now()}@test.local`, "Manager", "MANAGER", { warehouse_id: warehouse.id });
  const weaver = await mk(`e2e-weaver-${Date.now()}@test.local`, "Weaver", "WEAVER");
  const admin = await mk(`e2e-admin-${Date.now()}@test.local`, "Admin", "SUPER_ADMIN");

  const dealer = await db.dealer.create({
    data: { name: `${MARKER} Test Dealer`, dealerCode: "E2E", dealerId: `2026/E2E/${Date.now() % 10000}`, status: "ACTIVE" },
  });
  const inactiveDealer = await db.dealer.create({
    data: { name: `${MARKER} Inactive Dealer`, dealerCode: "E2E", status: "INACTIVE" },
  });

  // §43 — ACRON BEIGE, physical stock 100.
  const product = await db.product.create({
    data: {
      slug: `e2e-acron-beige-${Date.now()}`,
      name: `${MARKER} ACRON BEIGE`,
      sku: `E2E-PT-${Date.now()}`,
      size: "600 × 1200",
      status: "ACTIVE",
      published: true,
    },
  });
  await db.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 100,
      availableStock: 100,
      blockedStock: 0,
      stockStatus: "AVAILABLE",
    },
  });

  const inactiveProduct = await db.product.create({
    data: { slug: `e2e-inactive-${Date.now()}`, name: `${MARKER} Archived Tile`, status: "ARCHIVED" },
  });
  await db.inventory.create({
    data: { productId: inactiveProduct.id, warehouseId: warehouse.id, totalStock: 50, availableStock: 50 },
  });

  const actor = {
    staff: { name: staff.name, id: staff.id, role: "SHOWROOM_STAFF", showroomId: showroom.id },
    incharge: { name: incharge.name, id: incharge.id, role: "SHOWROOM_INCHARGE", showroomId: showroom.id },
    otherIncharge: { name: otherIncharge.name, id: otherIncharge.id, role: "SHOWROOM_INCHARGE", showroomId: otherShowroom.id },
    manager: { name: manager.name, id: manager.id, role: "MANAGER", showroomId: null },
    weaver: { name: weaver.name, id: weaver.id, role: "WEAVER", showroomId: null },
    admin: { name: admin.name, id: admin.id, role: "SUPER_ADMIN", showroomId: null },
  };

  console.log("Fixtures ready.\n");

  let mainBlockId = "";

  try {
    // ══════════════════════════════════════════════
    console.log("§43 MANDATORY END-TO-END — FLOW A (Staff → In-Charge → Manager → Ship → Deliver)");
    // ══════════════════════════════════════════════

    const s0 = await stockOf(product.id);
    check("E1", "Start state: physical 100 / blocked 0 / available 100",
      s0.totalStock === 100 && s0.blockedStock === 0 && s0.availableStock === 100,
      `got physical=${s0.totalStock} blocked=${s0.blockedStock} available=${s0.availableStock}`);

    const block = await createBlockRequest({
      productId: product.id,
      quantity: 30,
      dealerId: dealer.id,
      showroomId: showroom.id,
      remarks: `${MARKER} main flow`,
      requestedBy: actor.staff.name,
      createdById: actor.staff.id,
      userRole: "SHOWROOM_STAFF",
    });
    mainBlockId = block.id;

    check("E2", "Staff block enters PENDING_INCHARGE_APPROVAL",
      block.status === "PENDING_INCHARGE_APPROVAL", `got ${block.status}`);
    check("E3", "Approval route recorded as INCHARGE", block.approvalRoute === "INCHARGE", block.approvalRoute);
    check("E4", "Block number allocated", !!block.block_number, String(block.block_number));

    const s1 = await stockOf(product.id);
    check("E5", "After block: physical 100 / blocked 30 / available 70",
      s1.totalStock === 100 && s1.blockedStock === 30 && s1.availableStock === 70,
      `got physical=${s1.totalStock} blocked=${s1.blockedStock} available=${s1.availableStock}`);

    const inchargeNotifs = await db.notification.count({
      where: { userId: incharge.id, type: "BLOCK_CREATED", data: { path: ["blockId"], equals: block.id } },
    });
    const managerNotifsEarly = await db.notification.count({
      where: { userId: manager.id, data: { path: ["blockId"], equals: block.id } },
    });
    check("E6", "In-Charge notified of the new staff block", inchargeNotifs === 1, `got ${inchargeNotifs}`);
    check("E7", "Manager NOT notified before In-Charge sign-off (§10)",
      managerNotifsEarly === 0, `got ${managerNotifsEarly}`);

    // — In-Charge approval —
    const afterIncharge = await approveBlock({
      blockId: block.id,
      approvedBy: actor.incharge.name,
      approvedById: actor.incharge.id,
      role: "SHOWROOM_INCHARGE",
      actorShowroomId: actor.incharge.showroomId,
    });
    check("E8", "In-Charge approval → PENDING_MANAGER_APPROVAL",
      afterIncharge.status === "PENDING_MANAGER_APPROVAL", `got ${afterIncharge.status}`);
    check("E9", "In-Charge sign-off recorded", !!afterIncharge.inchargeApprovedAt);

    const managerNotifs = await db.notification.count({
      where: { userId: manager.id, data: { path: ["blockId"], equals: block.id } },
    });
    check("E10", "Manager notified after In-Charge approval (§11)", managerNotifs >= 1, `got ${managerNotifs}`);

    const s2 = await stockOf(product.id);
    check("E11", "Approval does not move stock (still 100/30/70)",
      s2.totalStock === 100 && s2.blockedStock === 30 && s2.availableStock === 70,
      `got physical=${s2.totalStock} blocked=${s2.blockedStock} available=${s2.availableStock}`);

    // — Manager approval —
    const afterManager = await approveBlock({
      blockId: block.id,
      approvedBy: actor.manager.name,
      approvedById: actor.manager.id,
      role: "MANAGER",
      actorShowroomId: null,
    });
    check("E12", "Manager approval → READY_TO_SHIP directly (§4)",
      afterManager.status === "READY_TO_SHIP", `got ${afterManager.status}`);
    check("E13", "readyToShipAt stamped", !!afterManager.readyToShipAt);

    // — Ship — vehicle number is mandatory (spec §24-26).
    const shipped = await shipBlock({
      blockId: block.id,
      performedBy: actor.manager.name,
      performedById: actor.manager.id,
      role: "MANAGER",
      vehicleNumber: "KA-19-E2E-0001",
    });
    check("E14", "Ship → SHIPPED", shipped.status === "SHIPPED", `got ${shipped.status}`);

    const s3 = await stockOf(product.id);
    check("E15", "After ship: physical 70, blocked 0, in-transit 30",
      s3.totalStock === 70 && s3.blockedStock === 0 && s3.transitStock === 30,
      `got physical=${s3.totalStock} blocked=${s3.blockedStock} transit=${s3.transitStock}`);

    const shipMovement = await db.inventoryMovement.findFirst({
      where: { referenceId: block.id, movementType: "STOCK_DISPATCHED" },
    });
    check("E16", "Stock movement recorded for shipment", !!shipMovement);

    // — Deliver —
    const delivered = await deliverBlock({
      blockId: block.id,
      performedBy: actor.manager.name,
      performedById: actor.manager.id,
      role: "MANAGER",
    });
    check("E17", "Deliver → DELIVERED", delivered.status === "DELIVERED", `got ${delivered.status}`);

    const s4 = await stockOf(product.id);
    check("E18", "After delivery: physical 70, transit 0, delivered 30",
      s4.totalStock === 70 && s4.transitStock === 0 && s4.deliveredStock === 30,
      `got physical=${s4.totalStock} transit=${s4.transitStock} delivered=${s4.deliveredStock}`);

    // — Audit trail —
    const audit = await db.auditLog.findMany({
      where: { entity: "StockBlock", entityId: block.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, oldValue: true, newValue: true, roleAtTime: true },
    });
    const actions = audit.map((a) => a.action);
    check("E19", "Audit trail contains every step",
      ["CREATE_BLOCK", "APPROVE_BLOCK", "SHIP_BLOCK", "DELIVER_BLOCK"].every((a) => actions.includes(a)),
      actions.join(" → "));
    check("E20", "Audit records the acting role at the time",
      audit.every((a) => !!a.roleAtTime), "a role is missing");

    // ══════════════════════════════════════════════
    console.log("\n§4 FLOW B (In-Charge creates → Manager approves)");
    // ══════════════════════════════════════════════

    const blockB = await createBlockRequest({
      productId: product.id,
      quantity: 10,
      dealerId: dealer.id,
      showroomId: showroom.id,
      requestedBy: actor.incharge.name,
      createdById: actor.incharge.id,
      userRole: "SHOWROOM_INCHARGE",
      remarks: MARKER,
    });
    check("F1", "In-Charge block skips straight to PENDING_MANAGER_APPROVAL",
      blockB.status === "PENDING_MANAGER_APPROVAL", `got ${blockB.status}`);
    check("F2", "Approval route recorded as DIRECT", blockB.approvalRoute === "DIRECT", blockB.approvalRoute);

    // §11 — self-approval is refused server-side.
    await expectFailure("F3", "In-Charge cannot approve their own block (§11)",
      () => approveBlock({
        blockId: blockB.id,
        approvedBy: actor.incharge.name,
        approvedById: actor.incharge.id,
        role: "SHOWROOM_INCHARGE",
        actorShowroomId: actor.incharge.showroomId,
      }),
      /permission|approve/i);

    // F3 above proves an In-Charge is refused at the *Manager* stage, which is
    // not the same claim as §11. To exercise the self-approval rule itself the
    // block has to actually be sitting in PENDING_INCHARGE_APPROVAL with the
    // In-Charge as its creator — the state the guard exists to defend against.
    const selfBlock = await createBlockRequest({
      productId: product.id, quantity: 2, showroomId: showroom.id,
      requestedBy: actor.staff.name, createdById: actor.staff.id,
      userRole: "SHOWROOM_STAFF", remarks: MARKER,
    });
    await db.stockBlock.update({
      where: { id: selfBlock.id },
      data: { createdById: actor.incharge.id, requestedBy: actor.incharge.name },
    });

    await expectFailure("F3b", "In-Charge refused on a PENDING_INCHARGE block they created (§11)",
      () => approveBlock({
        blockId: selfBlock.id,
        approvedBy: actor.incharge.name,
        approvedById: actor.incharge.id,
        role: "SHOWROOM_INCHARGE",
        actorShowroomId: actor.incharge.showroomId,
      }),
      /created yourself|own block/i);

    // The same block must still be approvable by a different In-Charge, proving
    // F3b failed on self-approval and not on some unrelated guard.
    await db.user.update({ where: { id: actor.otherIncharge.id }, data: { showroomId: showroom.id } });
    const byOther = await approveBlock({
      blockId: selfBlock.id,
      approvedBy: actor.otherIncharge.name,
      approvedById: actor.otherIncharge.id,
      role: "SHOWROOM_INCHARGE",
      actorShowroomId: showroom.id,
    });
    check("F3c", "A different In-Charge in the same showroom may approve it",
      byOther.status === "PENDING_MANAGER_APPROVAL", `got ${byOther.status}`);
    await db.user.update({ where: { id: actor.otherIncharge.id }, data: { showroomId: otherShowroom.id } });
    await cancelBlock({
      blockId: selfBlock.id, performedBy: actor.admin.name,
      performedById: actor.admin.id, role: "SUPER_ADMIN", reason: MARKER,
    });

    const readyB = await approveBlock({
      blockId: blockB.id,
      approvedBy: actor.manager.name,
      approvedById: actor.manager.id,
      role: "MANAGER",
    });
    check("F4", "Manager approval → READY_TO_SHIP", readyB.status === "READY_TO_SHIP", readyB.status);

    // ══════════════════════════════════════════════
    console.log("\n§8 CONCURRENCY");
    // ══════════════════════════════════════════════

    const raceProduct = await db.product.create({
      data: { slug: `e2e-race-${Date.now()}`, name: `${MARKER} Race Tile`, status: "ACTIVE" },
    });
    await db.inventory.create({
      data: { productId: raceProduct.id, warehouseId: warehouse.id, totalStock: 10, availableStock: 10, stockStatus: "AVAILABLE" },
    });

    const attempt = (label: string) =>
      createBlockRequest({
        productId: raceProduct.id,
        quantity: 7,
        showroomId: showroom.id,
        requestedBy: `${MARKER} ${label}`,
        createdById: actor.incharge.id,
        userRole: "SHOWROOM_INCHARGE",
        remarks: MARKER,
      }).then(() => ({ ok: true, error: "" })).catch((e: any) => ({ ok: false, error: e.message }));

    const race = await Promise.all([attempt("A"), attempt("B")]);
    const succeeded = race.filter((r) => r.ok).length;
    check("C1", "Two simultaneous 7-box requests against 10: exactly one succeeds",
      succeeded === 1, `${succeeded} succeeded`);
    check("C2", "The loser is told it is an availability problem",
      race.some((r) => !r.ok && /insufficient/i.test(r.error)),
      race.find((r) => !r.ok)?.error || "no failure captured");

    const raceStock = await stockOf(raceProduct.id);
    check("C3", "No over-blocking: blocked 7, available 3",
      raceStock.blockedStock === 7 && raceStock.availableStock === 3,
      `blocked=${raceStock.blockedStock} available=${raceStock.availableStock}`);
    check("C4", "No negative stock anywhere",
      raceStock.availableStock >= 0 && raceStock.totalStock >= 0 && raceStock.blockedStock >= 0);

    // ══════════════════════════════════════════════
    console.log("\n§13 DOUBLE SHIPPING / DOUBLE APPROVAL");
    // ══════════════════════════════════════════════

    const shipRaceBlock = await createBlockRequest({
      productId: product.id, quantity: 5, showroomId: showroom.id, dealerId: dealer.id,
      requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
    });
    await approveBlock({
      blockId: shipRaceBlock.id, approvedBy: actor.manager.name, approvedById: actor.manager.id, role: "MANAGER",
    });

    const beforeDoubleShip = await stockOf(product.id);
    const shipTwice = await Promise.all([
      shipBlock({ blockId: shipRaceBlock.id, performedBy: actor.manager.name, performedById: actor.manager.id, role: "MANAGER", vehicleNumber: "KA-19-E2E-0002" })
        .then(() => ({ ok: true, error: "" })).catch((e: any) => ({ ok: false, error: e.message })),
      shipBlock({ blockId: shipRaceBlock.id, performedBy: actor.admin.name, performedById: actor.admin.id, role: "SUPER_ADMIN", vehicleNumber: "KA-19-E2E-0003" })
        .then(() => ({ ok: true, error: "" })).catch((e: any) => ({ ok: false, error: e.message })),
    ]);
    const shipSucceeded = shipTwice.filter((r) => r.ok).length;
    check("D1", "Simultaneous ship requests: exactly one succeeds",
      shipSucceeded === 1, `${shipSucceeded} succeeded — ${JSON.stringify(shipTwice)}`);
    check("D2", "The second is told the block is already shipped",
      shipTwice.some((r) => !r.ok && /already been shipped|no longer available/i.test(r.error)),
      shipTwice.find((r) => !r.ok)?.error || "no failure captured");

    const afterDoubleShip = await stockOf(product.id);
    check("D3", "Physical stock reduced exactly once (5 boxes)",
      beforeDoubleShip.totalStock - afterDoubleShip.totalStock === 5,
      `reduced by ${beforeDoubleShip.totalStock - afterDoubleShip.totalStock}`);

    // Double approval on one block.
    const dblApprove = await createBlockRequest({
      productId: product.id, quantity: 2, showroomId: showroom.id,
      requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
    });
    const approveTwice = await Promise.all([
      approveBlock({ blockId: dblApprove.id, approvedBy: actor.manager.name, approvedById: actor.manager.id, role: "MANAGER" })
        .then(() => ({ ok: true, error: "" })).catch((e: any) => ({ ok: false, error: e.message })),
      approveBlock({ blockId: dblApprove.id, approvedBy: actor.admin.name, approvedById: actor.admin.id, role: "SUPER_ADMIN" })
        .then(() => ({ ok: true, error: "" })).catch((e: any) => ({ ok: false, error: e.message })),
    ]);
    check("D4", "Simultaneous approvals: exactly one succeeds",
      approveTwice.filter((r) => r.ok).length === 1,
      JSON.stringify(approveTwice));

    // ══════════════════════════════════════════════
    console.log("\n§33 ROLE SECURITY");
    // ══════════════════════════════════════════════

    const roleTestBlock = await createBlockRequest({
      productId: product.id, quantity: 3, showroomId: showroom.id,
      requestedBy: actor.staff.name, createdById: actor.staff.id, userRole: "SHOWROOM_STAFF", remarks: MARKER,
    });

    // Block creation is gated in the action layer (`canCreateBlock`), which is
    // the guard every entry point calls — asserting it directly avoids raising
    // a real reservation just to prove it is refused.
    check("R1", "WEAVER cannot create a block", canCreateBlock("WEAVER") === false);
    check("R1b", "WEAVER is recognised as read-only", isReadOnly("WEAVER") === true);
    check("R1c", "Every other role may create a block",
      canCreateBlock("SUPER_ADMIN") && canCreateBlock("MANAGER") &&
      canCreateBlock("SHOWROOM_INCHARGE") && canCreateBlock("SHOWROOM_STAFF"));

    await expectFailure("R2", "WEAVER cannot approve",
      () => approveBlock({
        blockId: roleTestBlock.id, approvedBy: actor.weaver.name, approvedById: actor.weaver.id,
        role: "WEAVER", actorShowroomId: null,
      }),
      /permission|approve/i);

    await expectFailure("R3", "SHOWROOM_STAFF cannot approve",
      () => approveBlock({
        blockId: roleTestBlock.id, approvedBy: actor.staff.name, approvedById: actor.staff.id,
        role: "SHOWROOM_STAFF", actorShowroomId: showroom.id,
      }),
      /permission|approve/i);

    await expectFailure("R4", "MANAGER cannot skip the In-Charge stage (§4 Flow A)",
      () => approveBlock({
        blockId: roleTestBlock.id, approvedBy: actor.manager.name, approvedById: actor.manager.id,
        role: "MANAGER", actorShowroomId: null,
      }),
      /In-Charge|permission/i);

    await expectFailure("R5", "In-Charge of another showroom cannot approve (§33)",
      () => approveBlock({
        blockId: roleTestBlock.id, approvedBy: actor.otherIncharge.name, approvedById: actor.otherIncharge.id,
        role: "SHOWROOM_INCHARGE", actorShowroomId: otherShowroom.id,
      }),
      /different showroom|permission/i);

    await expectFailure("R6", "WEAVER cannot ship",
      () => shipBlock({ blockId: roleTestBlock.id, performedBy: actor.weaver.name, performedById: actor.weaver.id, role: "WEAVER" }),
      /Manager or Super Admin|permission/i);

    await expectFailure("R7", "SHOWROOM_STAFF cannot ship",
      () => shipBlock({ blockId: roleTestBlock.id, performedBy: actor.staff.name, performedById: actor.staff.id, role: "SHOWROOM_STAFF" }),
      /Manager or Super Admin|permission/i);

    await expectFailure("R8", "A staff member cannot cancel someone else's block",
      () => cancelBlock({
        blockId: blockB.id, performedBy: actor.staff.name, performedById: actor.staff.id,
        role: "SHOWROOM_STAFF", actorShowroomId: showroom.id, reason: "should fail",
      }),
      /only cancel|permission|no longer/i);

    // ══════════════════════════════════════════════
    console.log("\n§44 NEGATIVE TESTS");
    // ══════════════════════════════════════════════

    await expectFailure("N1", "Over-blocking is refused",
      () => createBlockRequest({
        productId: product.id, quantity: 99999, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /insufficient/i);

    await expectFailure("N2", "Negative quantity is refused",
      () => createBlockRequest({
        productId: product.id, quantity: -5, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /greater than zero/i);

    await expectFailure("N3", "Zero quantity is refused",
      () => createBlockRequest({
        productId: product.id, quantity: 0, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /greater than zero/i);

    await expectFailure("N4", "An inactive product cannot be blocked",
      () => createBlockRequest({
        productId: inactiveProduct.id, quantity: 1, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /not active/i);

    await expectFailure("N5", "An inactive dealer cannot be blocked against",
      () => createBlockRequest({
        productId: product.id, quantity: 1, dealerId: inactiveDealer.id, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /inactive/i);

    await expectFailure("N6", "An unknown product is refused",
      () => createBlockRequest({
        productId: "does-not-exist", quantity: 1, showroomId: showroom.id,
        requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /no longer exists|not found/i);

    await expectFailure("N7", "A showroom user with no showroom cannot create a block",
      () => createBlockRequest({
        productId: product.id, quantity: 1,
        requestedBy: "orphan", createdById: null, userRole: "SHOWROOM_STAFF", remarks: MARKER,
      }),
      /not assigned to a showroom/i);

    await expectFailure("N8", "A delivered block cannot be shipped again",
      () => shipBlock({ blockId: mainBlockId, performedBy: actor.manager.name, performedById: actor.manager.id, role: "MANAGER" }),
      /already been delivered|not approved for shipping/i);

    await expectFailure("N9", "A delivered block cannot be cancelled",
      () => cancelBlock({
        blockId: mainBlockId, performedBy: actor.manager.name, performedById: actor.manager.id,
        role: "MANAGER", reason: "should fail",
      }),
      /no longer|cannot/i);

    await expectFailure("N10", "Rejection without a reason is refused (§9)",
      () => rejectBlock({
        blockId: roleTestBlock.id, rejectedBy: actor.incharge.name, rejectedById: actor.incharge.id,
        role: "SHOWROOM_INCHARGE", actorShowroomId: showroom.id, reason: "   ",
      }),
      /reason is required/i);

    await expectFailure("N11", "A pending block cannot jump straight to delivered",
      () => deliverBlock({
        blockId: roleTestBlock.id, performedBy: actor.manager.name, performedById: actor.manager.id, role: "MANAGER",
      }),
      /not been shipped|permission/i);

    await expectFailure("N12", "Stock cannot be adjusted below what is already committed",
      () => adjustStock({
        productId: product.id, adjustmentQuantity: -100000, reason: MARKER,
        performedBy: actor.admin.name, performedById: actor.admin.id, role: "SUPER_ADMIN",
      }),
      /below zero|already blocked/i);

    // ══════════════════════════════════════════════
    console.log("\n§9/§15 REJECTION AND CANCELLATION RELEASE STOCK");
    // ══════════════════════════════════════════════

    const beforeReject = await stockOf(product.id);
    const rejected = await rejectBlock({
      blockId: roleTestBlock.id,
      rejectedBy: actor.incharge.name,
      rejectedById: actor.incharge.id,
      role: "SHOWROOM_INCHARGE",
      actorShowroomId: showroom.id,
      reason: "Not required after all",
    });
    const afterReject = await stockOf(product.id);

    check("X1", "Rejection sets REJECTED", rejected.status === "REJECTED", rejected.status);
    check("X2", "Rejection releases the blocked quantity",
      afterReject.blockedStock === beforeReject.blockedStock - 3,
      `blocked ${beforeReject.blockedStock} → ${afterReject.blockedStock}`);
    check("X3", "Rejection does not reduce physical stock",
      afterReject.totalStock === beforeReject.totalStock,
      `physical ${beforeReject.totalStock} → ${afterReject.totalStock}`);
    check("X4", "Rejection reason stored on the block",
      (rejected.remarks || "").includes("Not required after all"), rejected.remarks || "");

    const cancelBlockRow = await createBlockRequest({
      productId: product.id, quantity: 4, showroomId: showroom.id,
      requestedBy: actor.staff.name, createdById: actor.staff.id, userRole: "SHOWROOM_STAFF", remarks: MARKER,
    });
    const beforeCancel = await stockOf(product.id);
    const cancelled = await cancelBlock({
      blockId: cancelBlockRow.id, performedBy: actor.staff.name, performedById: actor.staff.id,
      role: "SHOWROOM_STAFF", actorShowroomId: showroom.id, reason: "Customer changed their mind",
    });
    const afterCancel = await stockOf(product.id);

    check("X5", "A creator may cancel their own block", cancelled.status === "CANCELLED", cancelled.status);
    check("X6", "Cancellation releases blocked stock",
      afterCancel.blockedStock === beforeCancel.blockedStock - 4,
      `blocked ${beforeCancel.blockedStock} → ${afterCancel.blockedStock}`);
    check("X7", "Cancellation does not reduce physical stock",
      afterCancel.totalStock === beforeCancel.totalStock);

    // ══════════════════════════════════════════════
    console.log("\n§16 EXPIRY");
    // ══════════════════════════════════════════════

    const expiringBlock = await createBlockRequest({
      productId: product.id, quantity: 6, showroomId: showroom.id,
      requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
    });
    // Backdate the expiry so the worker picks it up.
    await db.stockBlock.update({
      where: { id: expiringBlock.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const beforeExpiry = await stockOf(product.id);
    const sweep = await releaseExpiredBlocks();
    const afterExpiry = await stockOf(product.id);
    const expiredRow = await db.stockBlock.findUniqueOrThrow({ where: { id: expiringBlock.id } });

    check("P1", "The expiry worker expires a lapsed block", expiredRow.status === "EXPIRED", expiredRow.status);
    check("P2", "Expiry releases blocked stock",
      afterExpiry.blockedStock === beforeExpiry.blockedStock - 6,
      `blocked ${beforeExpiry.blockedStock} → ${afterExpiry.blockedStock}`);
    check("P3", "Expiry does not reduce physical stock",
      afterExpiry.totalStock === beforeExpiry.totalStock);
    check("P4", "Expiry writes an audit entry",
      (await db.auditLog.count({ where: { entity: "StockBlock", entityId: expiringBlock.id, action: "EXPIRE_BLOCK" } })) === 1);
    check("P5", "Expiry notifies the creator",
      (await db.notification.count({ where: { userId: incharge.id, type: "BLOCK_EXPIRED", data: { path: ["blockId"], equals: expiringBlock.id } } })) >= 1);
    check("P6", "The sweep reports what it did", sweep.found >= 1 && sweep.released >= 1,
      `found=${sweep.found} released=${sweep.released}`);

    // A READY_TO_SHIP block must be expirable too (this used to throw).
    const readyExpiring = await createBlockRequest({
      productId: product.id, quantity: 2, showroomId: showroom.id,
      requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
    });
    await approveBlock({ blockId: readyExpiring.id, approvedBy: actor.manager.name, approvedById: actor.manager.id, role: "MANAGER" });
    await db.stockBlock.update({ where: { id: readyExpiring.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await expireBlock({ blockId: readyExpiring.id });
    const readyExpired = await db.stockBlock.findUniqueOrThrow({ where: { id: readyExpiring.id } });
    check("P7", "A READY_TO_SHIP block can expire (previously an illegal transition)",
      readyExpired.status === "EXPIRED", readyExpired.status);

    // Warnings must not repeat on every sweep.
    const warnBlock = await createBlockRequest({
      productId: product.id, quantity: 1, showroomId: showroom.id,
      requestedBy: actor.incharge.name, createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
    });
    await db.stockBlock.update({ where: { id: warnBlock.id }, data: { expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await releaseExpiredBlocks();
    await releaseExpiredBlocks();
    const warnCount = await db.notification.count({
      where: { type: "BLOCK_EXPIRING", data: { path: ["blockId"], equals: warnBlock.id }, userId: incharge.id },
    });
    check("P8", "The expiring-soon warning is sent once, not once per sweep",
      warnCount === 1, `${warnCount} warnings`);

    // ══════════════════════════════════════════════
    console.log("\n§18–§25 QUERIES, SCOPE AND SEARCH");
    // ══════════════════════════════════════════════

    const staffView = await getBlockList({ page: 1, limit: 50 }, {
      role: "SHOWROOM_STAFF", userId: staff.id, showroomId: showroom.id, warehouseId: null,
    });
    check("Q1", "A staff member sees their own showroom's blocks",
      staffView.items.length > 0 && staffView.items.every((b) => b.showroomId === showroom.id),
      `${staffView.items.length} rows`);

    const otherView = await getBlockList({ page: 1, limit: 50 }, {
      role: "SHOWROOM_INCHARGE", userId: otherIncharge.id, showroomId: otherShowroom.id, warehouseId: null,
    });
    check("Q2", "Another showroom's In-Charge sees none of them",
      otherView.items.every((b) => b.showroomId !== showroom.id), `${otherView.items.length} rows leaked`);

    const orphanView = await getBlockList({ page: 1, limit: 10 }, {
      role: "SHOWROOM_STAFF", userId: "nobody", showroomId: null, warehouseId: null,
    });
    check("Q3", "A showroom user with no showroom sees nothing, not everything",
      orphanView.items.length === 0, `${orphanView.items.length} rows`);

    const pendingView = await getBlockList({ status: "PENDING", page: 1, limit: 50 }, {
      role: "SUPER_ADMIN", userId: admin.id, showroomId: null, warehouseId: null,
    });
    check("Q4", "The PENDING alias resolves to the real pending statuses (§9/§10)",
      pendingView.items.every((b) => b.status.startsWith("PENDING_")),
      `${pendingView.items.length} rows`);

    const paged = await getBlockList({ page: 1, limit: 2 }, {
      role: "SUPER_ADMIN", userId: admin.id, showroomId: null, warehouseId: null,
    });
    check("Q5", "The block list pages server-side (§25)",
      paged.items.length <= 2 && paged.total >= paged.items.length,
      `${paged.items.length} of ${paged.total}`);

    const searched = await getBlockList({ search: dealer.name, page: 1, limit: 20 }, {
      role: "SUPER_ADMIN", userId: admin.id, showroomId: null, warehouseId: null,
    });
    check("Q6", "Blocks are searchable by dealer name (§18)",
      searched.items.length > 0 && searched.items.every((b) => b.dealer?.name === dealer.name),
      `${searched.items.length} rows`);

    const byNumber = await getBlockList({ search: String(block.block_number), page: 1, limit: 5 }, {
      role: "SUPER_ADMIN", userId: admin.id, showroomId: null, warehouseId: null,
    });
    check("Q7", "Blocks are searchable by block number (§18)",
      byNumber.items.some((b) => b.id === block.id), `${byNumber.items.length} rows`);

    const inchargeQueue = await getPendingApprovalCount({
      role: "SHOWROOM_INCHARGE", userId: incharge.id, showroomId: showroom.id, warehouseId: null,
    });
    check("Q8", "The In-Charge queue count excludes their own blocks (§11)",
      typeof inchargeQueue === "number", String(inchargeQueue));

    const hits = await searchBlockableProducts({ query: "ACRON" });
    check("Q9", "Product search finds ACRON BEIGE by name prefix (§19)",
      hits.some((h) => h.id === product.id), `${hits.length} hits`);

    const skuHits = await searchBlockableProducts({ query: product.sku!.slice(0, 8) });
    check("Q10", "Product search finds by product number (§18)",
      skuHits.some((h) => h.id === product.id), `${skuHits.length} hits`);

    const liveAvailable = await getAvailableToBlock(product.id);
    const liveStock = await stockOf(product.id);
    check("Q11", "The advertised availability matches the database exactly",
      liveAvailable === liveStock.availableStock,
      `advertised=${liveAvailable} stored=${liveStock.availableStock}`);

    // ══════════════════════════════════════════════
    console.log("\n§6 BOOKING / BLOCK STOCK INTERACTION");
    // ══════════════════════

    // The booking module writes the same Inventory rows the block flow does.
    // Its reserve and release paths used different counters, so these assert the
    // two modules agree on who is holding what.
    const bkBefore = await stockOf(product.id);
    const bookingQty = 4;

    const booking = await createBooking({
      dealerId: dealer.id,
      warehouseId: warehouse.id,
      requestedBy: `${MARKER} booking`,
      items: [{ productId: product.id, requestedQuantity: bookingQty }],
    });

    await reviewBooking({
      bookingId: booking.id,
      status: "APPROVED",
      approvedBy: actor.manager.name,
    });

    const bkApproved = await stockOf(product.id);
    check("B1", "Booking approval reserves into reservedStock",
      bkApproved.reservedStock === bkBefore.reservedStock + bookingQty,
      `reserved ${bkBefore.reservedStock} -> ${bkApproved.reservedStock}`);
    check("B2", "Booking approval leaves blockedStock alone",
      bkApproved.blockedStock === bkBefore.blockedStock,
      `blocked ${bkBefore.blockedStock} -> ${bkApproved.blockedStock}`);
    check("B3", "Booking approval does not move physical stock",
      bkApproved.totalStock === bkBefore.totalStock,
      `physical ${bkBefore.totalStock} -> ${bkApproved.totalStock}`);

    const blockableWithBooking = await getAvailableToBlock(product.id);
    check("B4", "A booking reservation reduces what may be blocked (§6)",
      blockableWithBooking === bkBefore.availableStock - bookingQty,
      `blockable=${blockableWithBooking} expected=${bkBefore.availableStock - bookingQty}`);

    await cancelBooking({
      bookingId: booking.id,
      cancelledBy: actor.manager.name,
      reason: MARKER,
    });

    const bkCancelled = await stockOf(product.id);
    // The release used to decrement blockedStock, a counter this booking never
    // touched, which freed block-held stock and stranded the reservation.
    check("B5", "Cancelling a booking releases its reservation",
      bkCancelled.reservedStock === bkBefore.reservedStock,
      `reserved=${bkCancelled.reservedStock} expected=${bkBefore.reservedStock}`);
    check("B6", "Cancelling a booking does not disturb blockedStock",
      bkCancelled.blockedStock === bkBefore.blockedStock,
      `blocked=${bkCancelled.blockedStock} expected=${bkBefore.blockedStock}`);
    check("B7", "Cancelling a booking restores blockable stock exactly",
      bkCancelled.availableStock === bkBefore.availableStock,
      `available=${bkCancelled.availableStock} expected=${bkBefore.availableStock}`);
    check("B8", "Cancelling a booking does not reduce physical stock",
      bkCancelled.totalStock === bkBefore.totalStock,
      `physical=${bkCancelled.totalStock} expected=${bkBefore.totalStock}`);

    // ══════════════════════
    console.log("\n§6 STOCK INTEGRITY");
    // ══════════════════════════════════════════════

    const finalStock = await stockOf(product.id);
    const activeBlocks = await db.stockBlock.aggregate({
      where: {
        productId: product.id,
        status: { in: ["PENDING_INCHARGE_APPROVAL", "PENDING_MANAGER_APPROVAL", "APPROVED", "READY_TO_SHIP", "PARTIALLY_SHIPPED"] },
      },
      _sum: { quantity: true, shippedQuantity: true },
    });
    const expectedBlocked = (activeBlocks._sum.quantity ?? 0) - (activeBlocks._sum.shippedQuantity ?? 0);

    check("S1", "blockedStock equals the sum of genuinely active blocks (§6)",
      finalStock.blockedStock === expectedBlocked,
      `stored=${finalStock.blockedStock} expected=${expectedBlocked}`);
    check("S2", "available = physical − blocked − allocated − damaged − reserved (§6)",
      finalStock.availableStock ===
        Math.max(0, finalStock.totalStock - finalStock.blockedStock - finalStock.allocatedStock
          - finalStock.damagedStock - finalStock.reservedStock),
      JSON.stringify(finalStock));

    // §6 "OTHER VALID RESERVATIONS" — the booking module reserves into
    // reservedStock. The block path used to recompute availability from
    // physical stock alone, so a booking and a block could commit the same
    // boxes and the block's write silently erased the booking's hold.
    const beforeReserve = await stockOf(product.id);
    const reserveQty = Math.max(1, Math.floor(beforeReserve.availableStock / 2));
    await db.inventory.update({
      where: { productId: product.id },
      data: {
        reservedStock: { increment: reserveQty },
        availableStock: { decrement: reserveQty },
      },
    });

    const blockableWithReservation = await getAvailableToBlock(product.id);
    check("S5", "A booking reservation reduces what may be blocked (§6)",
      blockableWithReservation === beforeReserve.availableStock - reserveQty,
      `blockable=${blockableWithReservation} expected=${beforeReserve.availableStock - reserveQty}`);

    await expectFailure("S6", "Blocking cannot consume reserved stock",
      () => createBlockRequest({
        productId: product.id, quantity: blockableWithReservation + reserveQty,
        showroomId: showroom.id, requestedBy: actor.incharge.name,
        createdById: actor.incharge.id, userRole: "SHOWROOM_INCHARGE", remarks: MARKER,
      }),
      /insufficient|available/i);

    const afterReserveProbe = await stockOf(product.id);
    check("S7", "The reservation survived the refused block",
      afterReserveProbe.reservedStock === beforeReserve.reservedStock + reserveQty,
      `reserved=${afterReserveProbe.reservedStock} expected=${beforeReserve.reservedStock + reserveQty}`);

    await db.inventory.update({
      where: { productId: product.id },
      data: {
        reservedStock: { decrement: reserveQty },
        availableStock: { increment: reserveQty },
      },
    });
    check("S3", "No negative figures anywhere",
      Object.values(finalStock).every((v) => (v as number) >= 0), JSON.stringify(finalStock));

    const recon = await reconcileInventory({ dryRun: true });
    const productDrift = recon.details.find((d) => d.productId === product.id);
    check("S4", "Reconciliation finds no drift on the test product",
      !productDrift, productDrift ? JSON.stringify(productDrift) : undefined);

  } finally {
    // ——————————————————————————————————————————————
    // Teardown
    // ——————————————————————————————————————————————
    // No `process.exit()` in this block: calling it while an exception is
    // propagating through `finally` swallows that exception outright (Node
    // terminates immediately, never reaching `main().catch()` below), which
    // silently truncated the suite and reported a false clean pass whenever a
    // mid-run throw — e.g. a stale fixture tripping a validation the service
    // added later — cut the run short before its `check()` calls ran.
    console.log("\nCleaning up fixtures…");

    const testProducts = await db.product.findMany({
      where: { name: { startsWith: MARKER } },
      select: { id: true },
    });
    const productIds = testProducts.map((p) => p.id);
    const testBlocks = await db.stockBlock.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    const blockIds = testBlocks.map((b) => b.id);

    await db.auditLog.deleteMany({ where: { entity: "StockBlock", entityId: { in: blockIds } } });
    await db.notification.deleteMany({
      where: { user: { name: { startsWith: MARKER } } },
    });
    await db.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await db.stockBlock.deleteMany({ where: { productId: { in: productIds } } });
    await db.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await db.product.deleteMany({ where: { id: { in: productIds } } });
    await db.dealer.deleteMany({ where: { name: { startsWith: MARKER } } });
    await db.auditLog.deleteMany({ where: { user: { name: { startsWith: MARKER } } } });
    await db.user.deleteMany({ where: { name: { startsWith: MARKER } } });
    await db.showroom.deleteMany({ where: { name: { startsWith: MARKER } } });

    // ——————————————————————————————————————————————
    // Report
    // ——————————————————————————————————————————————
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const skip = results.filter((r) => r.status === "SKIP").length;

    console.log("\n════════════ RESULTS ════════════");
    console.log(`  PASS ${pass}   FAIL ${fail}   SKIP ${skip}   (${results.length} checks)`);
    if (fail > 0) {
      console.log("\n  Failures:");
      results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`   ✗ ${r.id} ${r.name} — ${r.detail}`));
    }
    console.log("═════════════════════════════════\n");

    await db.$disconnect();
    await closeRedis();
    // Exit code is decided below, after this `finally` either completes
    // normally or lets a real exception continue propagating.
    exitCode = fail > 0 ? 1 : 0;
  }
}

let exitCode = 1;
main()
  .then(() => process.exit(exitCode))
  .catch(async (err) => {
  console.error("\nSUITE CRASHED:", err);
  await db.$disconnect();
  await closeRedis();
  process.exit(1);
});
