"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Save, ImageOff, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Option {
  id: string;
  name: string;
}

interface ProductRecord {
  id: string;
  name: string;
  sku: string | null;
  productCode: string | null;
  description: string | null;
  shortDescription: string | null;
  brandId: string | null;
  categoryId: string | null;
  collectionId: string | null;
  productTypeId: string | null;
  unitId: string | null;
  size: string | null;
  thickness: string | null;
  finish: string | null;
  surface: string | null;
  color: string | null;
  material: string | null;
  image_key: string | null;
  thumbnail_key: string | null;
  lifestyleImage: string | null;
  price: string | number | null;
  mrp: string | number | null;
  coverage: string | null;
  packing: string | null;
  tag: string | null;
  featured: boolean;
  designerPick: boolean;
  newArrival: boolean;
  published: boolean;
  status: string;
}

interface Props {
  mode: "create" | "edit";
  product?: ProductRecord;
  options: { brands: Option[]; categories: Option[]; collections: Option[]; productTypes: Option[]; units: Option[] };
}

type QuickAddKind = "brand" | "category" | "collection";

function TaxonomyPicker({
  label,
  kind,
  value,
  optionList,
  onChange,
  onOptionCreated,
}: {
  label: string;
  kind: QuickAddKind;
  value: string;
  optionList: Option[];
  onChange: (id: string) => void;
  onOptionCreated: (opt: Option) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/products/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to create");
      onOptionCreated({ id: json.data.id, name: json.data.name });
      onChange(json.data.id);
      setNewName("");
      setAdding(false);
      toast.success(`${label} created`);
    } catch (err: any) {
      toast.error(err.message || `Failed to create ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>
      {adding ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            placeholder={`New ${label.toLowerCase()} name`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={saving}
            onClick={handleCreate}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="p-2 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">— None —</option>
            {optionList.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            title={`Add new ${label.toLowerCase()}`}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 rounded-lg transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
      />
    </div>
  );
}

function mediaPreviewUrl(key: string): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  const base = process.env.NEXT_PUBLIC_S3_BUCKET_URL || "https://your-prestige-in.s3.ap-south-1.amazonaws.com";
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

function ImageUploadField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/products/upload-image", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Upload failed");
      onChange(json.data.key);
      toast.success(`${file.name} uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
        />
        <label className="relative shrink-0 p-2 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 rounded-lg transition cursor-pointer">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

export function ProductForm({ mode, product, options }: Props) {
  const router = useRouter();
  const [brands, setBrands] = useState(options.brands);
  const [categories, setCategories] = useState(options.categories);
  const [collections, setCollections] = useState(options.collections);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    productCode: product?.productCode || "",
    description: product?.description || "",
    shortDescription: product?.shortDescription || "",
    brandId: product?.brandId || "",
    categoryId: product?.categoryId || "",
    collectionId: product?.collectionId || "",
    productTypeId: product?.productTypeId || "",
    unitId: product?.unitId || "",
    size: product?.size || "",
    thickness: product?.thickness || "",
    finish: product?.finish || "",
    surface: product?.surface || "",
    color: product?.color || "",
    material: product?.material || "",
    image_key: product?.image_key || "",
    thumbnail_key: product?.thumbnail_key || "",
    lifestyleImage: product?.lifestyleImage || "",
    price: product?.price != null ? String(product.price) : "",
    mrp: product?.mrp != null ? String(product.mrp) : "",
    coverage: product?.coverage || "",
    packing: product?.packing || "",
    tag: product?.tag || "",
    featured: product?.featured ?? false,
    designerPick: product?.designerPick ?? false,
    newArrival: product?.newArrival ?? false,
    published: product?.published ?? true,
    status: product?.status || "ACTIVE",
  });

  const set = (key: keyof typeof form) => (value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        price: form.price ? parseFloat(form.price) : null,
        mrp: form.mrp ? parseFloat(form.mrp) : null,
      };

      const res = await fetch(mode === "create" ? "/api/v1/products" : `/api/v1/products/${product!.id}`, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");

      toast.success(mode === "create" ? "Product created" : "Product updated");
      router.push("/admin/products");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const thumb = form.thumbnail_key || form.image_key || form.lifestyleImage;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {mode === "create" ? "Add Product" : `Edit ${product?.name}`}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {mode === "create"
              ? "Creates the product and a zero-stock inventory record. Enter opening stock afterward via Inventory."
              : "Changes apply immediately and are recorded in the audit trail."}
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-600/25 shrink-0"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving…" : mode === "create" ? "Create Product" : "Save Changes"}
        </button>
      </div>

      <Section title="Identity">
        <Field label="Product Name" value={form.name} onChange={set("name")} placeholder="e.g. Acron Beige" required />
        <Field label="SKU" value={form.sku} onChange={set("sku")} placeholder="Unique stock code" />
        <Field label="Product Number" value={form.productCode} onChange={set("productCode")} placeholder="Manufacturer code" />
      </Section>

      <Section title="Classification">
        <TaxonomyPicker
          label="Brand"
          kind="brand"
          value={form.brandId}
          optionList={brands}
          onChange={set("brandId")}
          onOptionCreated={(o) => setBrands((prev) => [...prev, o])}
        />
        <TaxonomyPicker
          label="Category"
          kind="category"
          value={form.categoryId}
          optionList={categories}
          onChange={set("categoryId")}
          onOptionCreated={(o) => setCategories((prev) => [...prev, o])}
        />
        <TaxonomyPicker
          label="Collection"
          kind="collection"
          value={form.collectionId}
          optionList={collections}
          onChange={set("collectionId")}
          onOptionCreated={(o) => setCollections((prev) => [...prev, o])}
        />
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Product Type</label>
          <select
            value={form.productTypeId}
            onChange={(e) => set("productTypeId")(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">— None —</option>
            {options.productTypes.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Unit</label>
          <select
            value={form.unitId}
            onChange={(e) => set("unitId")(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">— None —</option>
            {options.units.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}{o.symbol ? ` (${o.symbol})` : ""}</option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Physical Attributes">
        <Field label="Size" value={form.size} onChange={set("size")} placeholder="e.g. 600x1200 mm" />
        <Field label="Thickness" value={form.thickness} onChange={set("thickness")} placeholder="e.g. 9mm" />
        <Field label="Finish" value={form.finish} onChange={set("finish")} placeholder="e.g. Matt" />
        <Field label="Surface" value={form.surface} onChange={set("surface")} placeholder="e.g. Glossy" />
        <Field label="Color" value={form.color} onChange={set("color")} />
        <Field label="Material" value={form.material} onChange={set("material")} />
      </Section>

      <Section title="Media">
        <div className="sm:col-span-2 lg:col-span-3 flex items-start gap-4">
          <div className="w-20 h-20 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
            {thumb ? (
              <img src={mediaPreviewUrl(thumb) || undefined} alt="" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            ) : (
              <ImageOff className="w-6 h-6 text-slate-600" />
            )}
          </div>
          <p className="flex-1 text-[11px] text-slate-500 self-center">
            Upload a file with the button next to each field, or paste an existing S3 key/URL directly.
          </p>
        </div>
        <ImageUploadField label="Primary Image" value={form.image_key} onChange={set("image_key")} placeholder="products/acron-beige/hero.jpg" />
        <ImageUploadField label="Thumbnail" value={form.thumbnail_key} onChange={set("thumbnail_key")} placeholder="products/acron-beige/thumb.jpg" />
        <ImageUploadField label="Lifestyle Image" value={form.lifestyleImage} onChange={set("lifestyleImage")} />
      </Section>

      <Section title="Description">
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-semibold text-slate-300 mb-1">Short Description</label>
          <input
            type="text"
            value={form.shortDescription}
            onChange={(e) => set("shortDescription")(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-semibold text-slate-300 mb-1">Full Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </Section>

      <Section title="Commercial">
        <Field label="Price" value={form.price} onChange={set("price")} placeholder="0.00" />
        <Field label="MRP" value={form.mrp} onChange={set("mrp")} placeholder="0.00" />
        <Field label="Coverage" value={form.coverage} onChange={set("coverage")} placeholder="e.g. 1.44 sqm/box" />
        <Field label="Packing" value={form.packing} onChange={set("packing")} placeholder="e.g. 4 pcs/box" />
        <Field label="Tag" value={form.tag} onChange={set("tag")} placeholder="e.g. Bestseller" />
      </Section>

      <Section title="Status">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Lifecycle Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status")(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <div className="flex flex-col justify-end gap-2 text-xs text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={(e) => set("published")(e.target.checked)} className="accent-indigo-600" />
            Published (visible to dealers/showrooms)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.featured} onChange={(e) => set("featured")(e.target.checked)} className="accent-indigo-600" />
            Featured
          </label>
        </div>
        <div className="flex flex-col justify-end gap-2 text-xs text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.designerPick} onChange={(e) => set("designerPick")(e.target.checked)} className="accent-indigo-600" />
            Designer Pick
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.newArrival} onChange={(e) => set("newArrival")(e.target.checked)} className="accent-indigo-600" />
            New Arrival
          </label>
        </div>
      </Section>
    </form>
  );
}
