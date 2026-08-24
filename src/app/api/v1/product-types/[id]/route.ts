import { NextResponse } from "next/server";
import { updateProductType, deleteProductType } from "@/services/ProductTypeService";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await updateProductType(id, body);
    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("PUT /api/v1/product-types/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update Product Type" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteProductType(id);
    return NextResponse.json({
      success: true,
      message: "Product Type deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/v1/product-types/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete Product Type" },
      { status: 400 }
    );
  }
}
