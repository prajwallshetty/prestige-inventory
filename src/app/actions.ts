"use server";

import { adjustStock } from "@/services/StockAdjustmentService";
import { createBlockRequest, approveBlock, releaseBlock } from "@/services/StockBlockService";
import { createShipment, receiveShipmentStock } from "@/services/ShipmentService";
import { revalidatePath } from "next/cache";

export async function adjustStockAction(formData: FormData) {
  const productId = formData.get("productId") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const reason = formData.get("reason") as string;

  if (!productId || isNaN(quantity)) {
    throw new Error("Invalid adjustment input.");
  }

  await adjustStock({
    productId,
    adjustmentQuantity: quantity,
    reason: reason || "Manual Inventory Adjustment",
    performedBy: "Inventory Manager",
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createBlockAction(formData: FormData) {
  const productId = formData.get("productId") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const remarks = formData.get("remarks") as string;
  const durationHours = parseInt((formData.get("durationHours") as string) || "48");

  await createBlockRequest({
    productId,
    quantity,
    remarks,
    durationHours,
    requestedBy: "Dealer Sales Rep",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function approveBlockAction(blockId: string) {
  await approveBlock({
    blockId,
    approvedBy: "Inventory Manager",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function releaseBlockAction(blockId: string, reason?: string) {
  await releaseBlock({
    blockId,
    releasedBy: "Inventory Manager",
    reason: reason || "Manual reservation release",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
