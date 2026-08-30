/**
 * Controlled Production Data Cleanup Script
 *
 * Safely removes transactional and operational test data while preserving:
 * - 100% of Users, User IDs, Passwords, Login Codes, Roles, and RBAC permissions.
 * - All 5 Showrooms and 2 Central Depots (Warehouses).
 * - 284 Audit Logs for security and compliance traceability.
 *
 * Usage: npx tsx scripts/clean-production-data.ts
 */
import { db } from "../src/lib/db";

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  CONTROLLED PRODUCTION DATA CLEANUP — EXECUTION");
  console.log("════════════════════════════════════════════════════════════\n");

  // 1. BEFORE CLEANUP SNAPSHOT
  const beforeCounts = {
    User: await db.user.count(),
    Showroom: await db.showroom.count(),
    Warehouse: await db.warehouse.count(),
    Dealer: await db.dealer.count(),
    StockBlock: await db.stockBlock.count(),
    BlockOrder: await db.blockOrder.count(),
    InventoryBlock: await db.inventoryBlock.count(),
    StockBooking: await db.stockBooking.count(),
    StockBookingItem: await db.stockBookingItem.count(),
    Shipment: await db.shipment.count(),
    ShipmentItem: await db.shipmentItem.count(),
    InventoryMovement: await db.inventoryMovement.count(),
    InventoryHistory: await db.inventoryHistory.count(),
    Notification: await db.notification.count(),
    Announcement: await db.announcement.count(),
    AnnouncementRecipient: await db.announcementRecipient.count(),
    Conversation: await db.conversation.count(),
    ConversationParticipant: await db.conversationParticipant.count(),
    Message: await db.message.count(),
    ChatAudit: await db.chatAudit.count(),
    Product: await db.product.count(),
    Inventory: await db.inventory.count(),
    ProductAttributeValue: await db.productAttributeValue.count(),
    ProductAttributeDefinition: await db.productAttributeDefinition.count(),
    ProductType: await db.productType.count(),
    CatalogImport: await db.catalogImport.count(),
    ExtractedProduct: await db.extractedProduct.count(),
    ImportAsset: await db.importAsset.count(),
    WhatsAppAnalytics: await db.whatsAppAnalytics.count(),
    AuditLog: await db.auditLog.count(),
  };

  console.log("PRE-CLEANUP RECORD COUNTS:");
  console.table(beforeCounts);
  console.log("\nStarting dependency-aware operational data cleanup...\n");

  // 2. EXECUTING DEPENDENCY-AWARE DELETIONS

  // Phase A: Internal Chat Data
  console.log("1. Clearing Internal Chat records...");
  await db.message.deleteMany({});
  await db.chatAudit.deleteMany({});
  await db.conversationParticipant.deleteMany({});
  await db.conversation.deleteMany({});
  console.log("   ✓ Chat messages, audits, participants, and conversations cleared.");

  // Phase B: Notifications & Announcements
  console.log("2. Clearing Notifications & Announcements...");
  await db.notification.deleteMany({});
  await db.announcementRecipient.deleteMany({});
  await db.announcement.deleteMany({});
  console.log("   ✓ Notifications and announcements cleared.");

  // Phase C: Analytics & Temporary Tracking
  console.log("3. Clearing Analytics...");
  await db.whatsAppAnalytics.deleteMany({});
  console.log("   ✓ WhatsApp analytics cleared.");

  // Phase D: Inventory Movements & Histories
  console.log("4. Clearing Inventory Movements & History...");
  await db.inventoryMovement.deleteMany({});
  await db.inventoryHistory.deleteMany({});
  console.log("   ✓ Inventory movements and history cleared.");

  // Phase E: Stock Blocks, Orders, & Approvals
  console.log("5. Clearing Stock Blocks, Block Orders, & Bookings...");
  await db.stockBlock.deleteMany({});
  await db.blockOrder.deleteMany({});
  await db.inventoryBlock.deleteMany({});
  await db.stockBookingItem.deleteMany({});
  await db.stockBooking.deleteMany({});
  console.log("   ✓ Stock blocks, approval queues, and block orders cleared.");

  // Phase F: Shipments & Procurement
  console.log("6. Clearing Shipments & Procurement records...");
  await db.shipmentItem.deleteMany({});
  await db.shipment.deleteMany({});
  console.log("   ✓ Shipments and procurement records cleared.");

  // Phase G: Catalog & Inventory Records
  console.log("7. Clearing Catalog & Inventory records...");
  await db.productAttributeValue.deleteMany({});
  await db.inventory.deleteMany({});
  await db.product.deleteMany({});
  await db.importAsset.deleteMany({});
  await db.extractedProduct.deleteMany({});
  await db.catalogImport.deleteMany({});
  console.log("   ✓ Products, inventories, attributes, and catalog import records cleared.");

  // 3. AFTER CLEANUP SNAPSHOT & AUDIT
  const afterCounts = {
    User: await db.user.count(),
    Showroom: await db.showroom.count(),
    Warehouse: await db.warehouse.count(),
    Dealer: await db.dealer.count(),
    StockBlock: await db.stockBlock.count(),
    BlockOrder: await db.blockOrder.count(),
    InventoryBlock: await db.inventoryBlock.count(),
    StockBooking: await db.stockBooking.count(),
    StockBookingItem: await db.stockBookingItem.count(),
    Shipment: await db.shipment.count(),
    ShipmentItem: await db.shipmentItem.count(),
    InventoryMovement: await db.inventoryMovement.count(),
    InventoryHistory: await db.inventoryHistory.count(),
    Notification: await db.notification.count(),
    Announcement: await db.announcement.count(),
    AnnouncementRecipient: await db.announcementRecipient.count(),
    Conversation: await db.conversation.count(),
    ConversationParticipant: await db.conversationParticipant.count(),
    Message: await db.message.count(),
    ChatAudit: await db.chatAudit.count(),
    Product: await db.product.count(),
    Inventory: await db.inventory.count(),
    ProductAttributeValue: await db.productAttributeValue.count(),
    ProductAttributeDefinition: await db.productAttributeDefinition.count(),
    ProductType: await db.productType.count(),
    CatalogImport: await db.catalogImport.count(),
    ExtractedProduct: await db.extractedProduct.count(),
    ImportAsset: await db.importAsset.count(),
    WhatsAppAnalytics: await db.whatsAppAnalytics.count(),
    AuditLog: await db.auditLog.count(),
  };

  console.log("\nPOST-CLEANUP RECORD COUNTS:");
  console.table(afterCounts);

  const usersIntact = afterCounts.User === beforeCounts.User;
  const showroomsIntact = afterCounts.Showroom === beforeCounts.Showroom;
  const warehousesIntact = afterCounts.Warehouse === beforeCounts.Warehouse;
  const auditLogsIntact = afterCounts.AuditLog === beforeCounts.AuditLog;
  const catalogCleared = afterCounts.Product === 0 && afterCounts.Inventory === 0;
  const blocksCleared = afterCounts.StockBlock === 0 && afterCounts.BlockOrder === 0;
  const shipmentsCleared = afterCounts.Shipment === 0 && afterCounts.ShipmentItem === 0;
  const notificationsCleared = afterCounts.Notification === 0;
  const chatCleared = afterCounts.Conversation === 0 && afterCounts.Message === 0;

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  VERIFICATION AUDIT");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  - Users Intact: ${usersIntact ? "YES" : "NO"} (${afterCounts.User}/${beforeCounts.User})`);
  console.log(`  - Showrooms Intact: ${showroomsIntact ? "YES" : "NO"} (${afterCounts.Showroom}/${beforeCounts.Showroom})`);
  console.log(`  - Warehouses Intact: ${warehousesIntact ? "YES" : "NO"} (${afterCounts.Warehouse}/${beforeCounts.Warehouse})`);
  console.log(`  - Audit Logs Intact: ${auditLogsIntact ? "YES" : "NO"} (${afterCounts.AuditLog}/${beforeCounts.AuditLog})`);
  console.log(`  - Product Catalog Cleared: ${catalogCleared ? "YES" : "NO"} (${afterCounts.Product} products)`);
  console.log(`  - Blocks & Approvals Cleared: ${blocksCleared ? "YES" : "NO"} (${afterCounts.StockBlock} blocks)`);
  console.log(`  - Shipments & Transit Cleared: ${shipmentsCleared ? "YES" : "NO"} (${afterCounts.Shipment} shipments)`);
  console.log(`  - Notifications Cleared: ${notificationsCleared ? "YES" : "NO"} (${afterCounts.Notification} notifications)`);
  console.log(`  - Chat Conversations Cleared: ${chatCleared ? "YES" : "NO"} (${afterCounts.Conversation} conversations)`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (
    usersIntact &&
    showroomsIntact &&
    warehousesIntact &&
    catalogCleared &&
    blocksCleared &&
    shipmentsCleared &&
    notificationsCleared &&
    chatCleared
  ) {
    console.log("SUCCESS: Controlled production cleanup completed safely. Application in clean operational state.");
  } else {
    console.error("ERROR: Verification audit failed.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("\n[CLEANUP ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
