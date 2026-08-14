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
