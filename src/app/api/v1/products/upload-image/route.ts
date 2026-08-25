import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { assertPermission, canManageProducts, type Role } from "@/lib/permissions";
import { uploadBufferToS3, sanitizeFileName, isS3Configured } from "@/lib/s3";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    assertPermission(canManageProducts(session.role as Role), "Only Super Admin can upload product images.");

    if (!isS3Configured()) {
      return NextResponse.json(
        { success: false, error: "Image storage is not configured. Contact an administrator." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "Image exceeds 10MB limit" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `products/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { url } = await uploadBufferToS3({ buffer, key, contentType: file.type });

    return NextResponse.json({ success: true, data: { key, url, name: file.name, size: file.size } });
  } catch (error: any) {
    console.error("POST /api/v1/products/upload-image error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload image" },
      { status: error.statusCode || 500 }
    );
  }
}
