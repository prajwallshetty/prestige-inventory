import { NextResponse } from "next/server";
import { upsertAttributeDefinition, deleteAttributeDefinition } from "@/services/ProductTypeService";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: productTypeId } = await params;
    const body = await req.json();

    if (!body.name || !body.key) {
      return NextResponse.json(
        { success: false, error: "Attribute name and key are required" },
        { status: 400 }
      );
    }

    const attr = await upsertAttributeDefinition({
      productTypeId,
      name: body.name,
      key: body.key,
      dataType: body.dataType,
      unit: body.unit,
      options: body.options,
      isRequired: body.isRequired,
      isFilterable: body.isFilterable,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({
      success: true,
      data: attr,
    });
  } catch (error: any) {
    console.error("POST /api/v1/product-types/[id]/attributes error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save Attribute Definition" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const attributeId = searchParams.get("attributeId");

    if (!attributeId) {
      return NextResponse.json(
        { success: false, error: "attributeId parameter is required" },
        { status: 400 }
      );
    }

    await deleteAttributeDefinition(attributeId);
    return NextResponse.json({
      success: true,
      message: "Attribute Definition deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/v1/product-types/[id]/attributes error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete Attribute Definition" },
      { status: 500 }
    );
  }
}
