import { db } from "../src/lib/db";

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  COMPLETE PRISMA MODEL & TABLE RECORD COUNT INSPECTION");
  console.log("════════════════════════════════════════════════════════════\n");

  const counts: Record<string, number> = {
    // 1. MUST PRESERVE
    User: await db.user.count(),
    Showroom: await db.showroom.count(),
    Warehouse: await db.warehouse.count(),
    Dealer: await db.dealer.count(),

    // 2. TRANSACTIONAL / OPERATIONAL DATA TO CLEAR
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

    // 3. CATALOG & INVENTORY DATA TO CLEAR
    Product: await db.product.count(),
    Inventory: await db.inventory.count(),
    ProductAttributeValue: await db.productAttributeValue.count(),
    ProductAttributeDefinition: await db.productAttributeDefinition.count(),
    ProductType: await db.productType.count(),
    CatalogImport: await db.catalogImport.count(),
    ExtractedProduct: await db.extractedProduct.count(),
    ImportAsset: await db.importAsset.count(),
    Category: await db.category.count(),
    Brand: await db.brand.count(),

    // 4. AUDIT & ANALYTICS
    AuditLog: await db.auditLog.count(),
    WhatsAppAnalytics: await db.whatsAppAnalytics.count(),
  };

  console.table(counts);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
