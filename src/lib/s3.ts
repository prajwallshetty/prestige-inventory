import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return cachedClient;
}

export function isS3Configured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);
}

/** Sanitizes a filename to something safe for an S3 key segment. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

/**
 * Uploads a buffer to the configured bucket and returns its key + public URL.
 * No ACL is set — buckets created after 2023 default to ACLs disabled, and
 * public read is expected to come from a bucket policy (the existing
 * NEXT_PUBLIC_S3_BUCKET_URL scheme already assumes objects are readable that
 * way, since it builds plain HTTPS URLs with no signing).
 */
export async function uploadBufferToS3(params: {
  buffer: Buffer;
  key: string;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured.");

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return { key: params.key, url: getS3MediaUrl(params.key)! };
}

export async function deleteFromS3(key: string): Promise<void> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket || !key) return;
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function getS3MediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  
  // If it's already a full URL (external fallback or cached URL), return as is
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_S3_BUCKET_URL || process.env.S3_BUCKET_URL || "https://your-prestige-in.s3.ap-south-1.amazonaws.com";
  
  // Clean trailing and leading slashes
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  
  return `${cleanBaseUrl}/${cleanKey}`;
}

export function getProductImageUrl(product: {
  image_key?: string | null;
  lifestyleImage?: string | null;
  textureImage?: string | null;
} | null | undefined): string | null {
  if (!product) return null;
  
  // Use image_key if available, fallback to legacy lifestyleImage or textureImage
  const key = product.image_key || product.lifestyleImage || product.textureImage;
  return getS3MediaUrl(key);
}

export function getProductThumbnailUrl(product: {
  thumbnail_key?: string | null;
  image_key?: string | null;
  lifestyleImage?: string | null;
  textureImage?: string | null;
} | null | undefined): string | null {
  if (!product) return null;
  
  // Use thumbnail_key if available, fallback to image_key, then legacy fields
  const key = product.thumbnail_key || product.image_key || product.lifestyleImage || product.textureImage;
  return getS3MediaUrl(key);
}
