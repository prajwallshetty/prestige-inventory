"use client";

import React, { useState } from "react";
import { Plus, X, Upload, Loader2, Image as ImageIcon, Star, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface NImagesManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  primaryImage?: string;
  onSetPrimary?: (url: string) => void;
}

export function mediaPreviewUrl(key: string): string {
  if (!key) return "";
  if (key.startsWith("http") || key.startsWith("blob:") || key.startsWith("data:")) return key;
  const base = process.env.NEXT_PUBLIC_S3_BUCKET_URL || "https://your-prestige-in.s3.ap-south-1.amazonaws.com";
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

export function NImagesManager({
  images = [],
  onChange,
  primaryImage,
  onSetPrimary,
}: NImagesManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    const newKeys: string[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/v1/products/upload-image", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Upload failed");
        newKeys.push(json.data.key);
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    if (newKeys.length > 0) {
      const updated = [...images, ...newKeys];
      onChange(updated);
      toast.success(`Added ${newKeys.length} image(s) to product gallery.`);
      if (!primaryImage && onSetPrimary && newKeys[0]) {
        onSetPrimary(newKeys[0]);
      }
    }
    setUploading(false);
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (images.includes(trimmed)) {
      toast.error("Image URL already added.");
      return;
    }
    const updated = [...images, trimmed];
    onChange(updated);
    setUrlInput("");
    toast.success("Image URL added to gallery.");
    if (!primaryImage && onSetPrimary) {
      onSetPrimary(trimmed);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const targetUrl = images[indexToRemove];
    const updated = images.filter((_, idx) => idx !== indexToRemove);
    onChange(updated);
    if (primaryImage === targetUrl && onSetPrimary) {
      onSetPrimary(updated[0] || "");
    }
  };

  const handleSetAsPrimary = (url: string, index: number) => {
    if (onSetPrimary) {
      onSetPrimary(url);
    }
    // Also reorder array so primary is index 0
    const reordered = [url, ...images.filter((_, idx) => idx !== index)];
    onChange(reordered);
    toast.success("Set as primary hero image.");
  };

  return (
    <div className="space-y-3.5 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#EAEAEA] pb-3">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-black uppercase text-[#111111] tracking-wider">
            <ImageIcon className="h-4 w-4 text-[#F2C202]" />
            Product Images Gallery ({images.length} Images)
          </h4>
          <p className="text-[10px] text-[#6B6B6B] mt-0.5">
            Add N number of images under this product (hero photos, texture close-ups, installed renders, tile angles).
          </p>
        </div>

        {/* Upload Button */}
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#F2C202] px-3.5 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-xs shrink-0">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>Upload Image(s)</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Manual URL Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddUrl())}
          placeholder="Paste Image URL / S3 key (e.g. products/tile-render.jpg)..."
          className="flex-1 rounded-xl border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-medium focus:border-[#F2C202] focus:outline-hidden"
        />
        <button
          type="button"
          onClick={handleAddUrl}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add URL
        </button>
      </div>

      {/* Thumbnail Gallery Grid */}
      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#EAEAEA] bg-white p-6 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-[#6B6B6B]/40 mb-2" />
          <p className="text-xs font-bold text-[#111111]">No images uploaded yet.</p>
          <p className="text-[10px] text-[#6B6B6B] mt-0.5">
            Click "Upload Image(s)" above or paste an image URL to add unlimited product photos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
          {images.map((imgUrl, index) => {
            const isPrimary = index === 0 || imgUrl === primaryImage;
            const src = mediaPreviewUrl(imgUrl);
            return (
              <div
                key={`${imgUrl}-${index}`}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-xs transition-all ${
                  isPrimary ? "border-[#F2C202] ring-2 ring-[#F2C202]/30" : "border-[#EAEAEA] hover:border-slate-300"
                }`}
              >
                {/* Image Aspect Box */}
                <div className="relative h-24 w-full bg-[#F7F7F5]">
                  <img
                    src={src}
                    alt={`Product angle ${index + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23ccc'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EImage%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {isPrimary && (
                    <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-[#F2C202] px-1.5 py-0.5 text-[9px] font-black text-white shadow-xs">
                      <Star className="h-3 w-3 fill-white" /> Primary
                    </span>
                  )}
                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1.5 right-1.5 rounded-md bg-black/60 p-1 text-white hover:bg-rose-600 transition-all opacity-90 sm:opacity-0 group-hover:opacity-100"
                    title="Remove Image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between p-1.5 bg-white border-t border-[#EAEAEA]">
                  <span className="text-[9px] font-mono font-bold text-[#6B6B6B] truncate max-w-[70px]">
                    #{index + 1}
                  </span>
                  {!isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetAsPrimary(imgUrl, index)}
                      className="text-[9px] font-black text-[#8A7300] hover:underline"
                    >
                      Make Primary
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
