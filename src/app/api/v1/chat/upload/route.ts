import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { uploadBufferToS3, sanitizeFileName, isS3Configured } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // 25MB max size
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "File size exceeds 25MB limit" }, { status: 400 });
    }

    // Validate file type (Images, PDFs, Documents, Spreadsheets)
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File type not supported. Please upload images, PDFs, or documents." },
        { status: 400 }
      );
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { success: false, error: "File storage is not configured. Contact an administrator." },
        { status: 503 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const key = `chat-attachments/${Date.now()}-${sanitizeFileName(file.name)}`;

    const { url } = await uploadBufferToS3({ buffer, key, contentType: file.type });

    return NextResponse.json({
      success: true,
      data: {
        attachmentUrl: url,
        attachmentKey: key,
        attachmentName: file.name,
        size: file.size,
        type: file.type,
      },
    });
  } catch (error: any) {
    console.error("POST /api/v1/chat/upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload attachment" },
      { status: 500 }
    );
  }
}
