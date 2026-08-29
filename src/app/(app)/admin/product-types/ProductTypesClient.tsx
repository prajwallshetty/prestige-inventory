"use client";

import { useState } from "react";
import {
  Boxes,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Settings2,
  Layers,
  ChevronRight,
  Sparkles,
  Search,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface AttributeDef {
  id: string;
  name: string;
  key: string;
  dataType: string;
  unit?: string | null;
  options?: any;
  isRequired: boolean;
  isFilterable: boolean;
  sortOrder: number;
}

interface ProductTypeItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  attributeDefinitions: AttributeDef[];
  _count: { products: number };
}

interface Props {
  initialProductTypes: ProductTypeItem[];
}

export default function ProductTypesClient({ initialProductTypes }: Props) {
  const [types, setTypes] = useState<ProductTypeItem[]>(initialProductTypes);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<ProductTypeItem | null>(
    types.length > 0 ? types[0] : null
  );

  // Modal States
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProductTypeItem | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [typeIcon, setTypeIcon] = useState("Boxes");
  const [typeSortOrder, setTypeSortOrder] = useState(0);

  // Attribute Modal States
  const [isAttrModalOpen, setIsAttrModalOpen] = useState(false);
  const [attrName, setAttrName] = useState("");
  const [attrKey, setAttrKey] = useState("");
  const [attrDataType, setAttrDataType] = useState("text");
  const [attrUnit, setAttrUnit] = useState("");
  const [attrOptions, setAttrOptions] = useState("");
  const [attrIsRequired, setAttrIsRequired] = useState(false);

  // Guards against double-submit on rapid/repeated clicks.
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingAttrId, setDeletingAttrId] = useState<string | null>(null);

  const filteredTypes = types.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateTypeModal = () => {
    setEditingType(null);
    setTypeName("");
    setTypeDescription("");
    setTypeIcon("Boxes");
    setTypeSortOrder(types.length + 1);
    setIsTypeModalOpen(true);
  };

  const openEditTypeModal = (pt: ProductTypeItem) => {
    setEditingType(pt);
    setTypeName(pt.name);
    setTypeDescription(pt.description || "");
    setTypeIcon(pt.icon || "Boxes");
    setTypeSortOrder(pt.sortOrder);
    setIsTypeModalOpen(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) {
      toast.error("Product Type name is required");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      if (editingType) {
        const res = await fetch(`/api/v1/product-types/${editingType.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: typeName,
            description: typeDescription,
            icon: typeIcon,
            sortOrder: typeSortOrder,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Update failed");
        
        setTypes((prev) =>
          prev.map((t) => (t.id === editingType.id ? { ...t, ...json.data } : t))
        );
        if (selectedType?.id === editingType.id) {
          setSelectedType((prev) => (prev ? { ...prev, ...json.data } : null));
        }
        toast.success("Product Type updated successfully");
      } else {
        const res = await fetch("/api/v1/product-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: typeName,
            description: typeDescription,
            icon: typeIcon,
            sortOrder: typeSortOrder,
            isActive: true,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Creation failed");

        setTypes((prev) => [...prev, { ...json.data, attributeDefinitions: [], _count: { products: 0 } }]);
        toast.success("Product Type created successfully");
      }
      setIsTypeModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save Product Type");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (pt: ProductTypeItem) => {
    if (togglingId) return;
    setTogglingId(pt.id);
    try {
      const res = await fetch(`/api/v1/product-types/${pt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pt.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setTypes((prev) =>
        prev.map((t) => (t.id === pt.id ? { ...t, isActive: !pt.isActive } : t))
      );
      toast.success(`${pt.name} ${!pt.isActive ? "activated" : "deactivated"}`);
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !attrName.trim()) {
      toast.error("Attribute name is required");
      return;
    }
    if (saving) return;

    const key = attrKey.trim() || attrName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const parsedOptions = attrOptions.trim()
      ? attrOptions.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/product-types/${selectedType.id}/attributes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: attrName,
          key,
          dataType: attrDataType,
          unit: attrUnit.trim() || null,
          options: parsedOptions,
          isRequired: attrIsRequired,
          sortOrder: selectedType.attributeDefinitions.length + 1,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to save attribute");

      const updatedAttr = json.data;
      setSelectedType((prev) => {
        if (!prev) return null;
        const exists = prev.attributeDefinitions.some((a) => a.id === updatedAttr.id);
        const newAttrs = exists
          ? prev.attributeDefinitions.map((a) => (a.id === updatedAttr.id ? updatedAttr : a))
          : [...prev.attributeDefinitions, updatedAttr];
        return { ...prev, attributeDefinitions: newAttrs };
      });

      setTypes((prev) =>
        prev.map((t) => {
          if (t.id !== selectedType.id) return t;
          const exists = t.attributeDefinitions.some((a) => a.id === updatedAttr.id);
          const newAttrs = exists
            ? t.attributeDefinitions.map((a) => (a.id === updatedAttr.id ? updatedAttr : a))
            : [...t.attributeDefinitions, updatedAttr];
          return { ...t, attributeDefinitions: newAttrs };
        })
      );

      toast.success("Attribute definition saved");
      setIsAttrModalOpen(false);
      setAttrName("");
      setAttrKey("");
      setAttrUnit("");
      setAttrOptions("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save attribute definition");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttribute = async (attrId: string) => {
    if (!selectedType || deletingAttrId) return;
    setDeletingAttrId(attrId);
    try {
      const res = await fetch(
        `/api/v1/product-types/${selectedType.id}/attributes?attributeId=${attrId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setSelectedType((prev) =>
        prev ? { ...prev, attributeDefinitions: prev.attributeDefinitions.filter((a) => a.id !== attrId) } : null
      );
      toast.success("Attribute removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete attribute");
    } finally {
      setDeletingAttrId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-[#EAEAEA] p-6 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-[#F2C202] font-black text-xs uppercase tracking-wider mb-1">
            <Layers className="w-4 h-4" /> Multi-Category ERP Configuration
          </div>
          <h1 className="text-xl font-black text-[#111111] tracking-tight">Product Types & Architecture</h1>
          <p className="text-[#6B6B6B] text-xs mt-1">
            Manage product categories (Tiles, Sanitary, Paints, Adhesives, Bath Fittings) & dynamic EAV attributes.
          </p>
        </div>
        <button
          onClick={openCreateTypeModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F2C202] hover:bg-[#D8AD02] text-white font-black text-xs rounded-xl transition shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Product Type
        </button>
      </div>

      {/* Main Grid: Left List / Right Attributes Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Types List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search product types..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-[#EAEAEA] text-[#111111] text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-hidden focus:border-[#F2C202] transition"
            />
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-2xl divide-y divide-[#EAEAEA] overflow-hidden shadow-xs">
            {filteredTypes.length === 0 ? (
              <div className="p-8 text-center text-[#6B6B6B] text-xs">No product types found.</div>
            ) : (
              filteredTypes.map((pt) => {
                const isSelected = selectedType?.id === pt.id;
                return (
                  <div
                    key={pt.id}
                    onClick={() => setSelectedType(pt)}
                    className={`p-4 cursor-pointer transition flex items-center justify-between group ${
                      isSelected
                        ? "bg-[#F2C202]/10 border-l-4 border-[#F2C202]"
                        : "hover:bg-[#F7F7F5]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${
                        isSelected
                          ? "bg-[#F2C202]/20 border-[#F2C202]/40 text-[#8A7300]"
                          : "bg-[#F7F7F5] border-[#EAEAEA] text-[#6B6B6B]"
                      }`}>
                        <Boxes className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`font-bold text-xs ${isSelected ? "text-[#111111]" : "text-[#111111]"}`}>
                            {pt.name}
                          </h3>
                          {!pt.isActive && (
                            <span className="px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 rounded-full">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6B6B6B] line-clamp-1 mt-0.5">
                          {pt.description || "No description specified"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold px-2.5 py-1 bg-[#F7F7F5] text-[#111111] border border-[#EAEAEA] rounded-lg">
                        {pt._count.products} Products
                      </span>
                      <ChevronRight className={`w-4 h-4 transition ${isSelected ? "text-[#F2C202] translate-x-0.5" : "text-[#6B6B6B]"}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Product Type Details & Dynamic Attributes */}
        <div className="lg:col-span-7 space-y-6">
          {selectedType ? (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-6 shadow-xs">
              {/* Header Info */}
              <div className="flex items-start justify-between pb-6 border-b border-[#EAEAEA]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#F2C202]/10 text-[#8A7300] border border-[#F2C202]/20 rounded-md">
                      Slug: {selectedType.slug}
                    </span>
                    <span className="text-[10px] text-[#6B6B6B] font-mono">Order: #{selectedType.sortOrder}</span>
                  </div>
                  <h2 className="text-lg font-black text-[#111111]">{selectedType.name}</h2>
                  <p className="text-[#6B6B6B] text-xs">{selectedType.description || "No description"}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditTypeModal(selectedType)}
                    className="p-2 bg-[#F7F7F5] border border-[#EAEAEA] hover:bg-[#EAEAEA] text-[#111111] rounded-xl transition"
                    title="Edit Product Type"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(selectedType)}
                    disabled={togglingId === selectedType.id}
                    className={`p-2 rounded-xl transition border disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedType.isActive
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    }`}
                    title={selectedType.isActive ? "Deactivate" : "Activate"}
                  >
                    {selectedType.isActive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Attributes Section Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-[#111111] flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-[#F2C202]" /> Dynamic Attribute Definitions
                  </h3>
                  <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                    Fields automatically rendered on Product creation forms for {selectedType.name}.
                  </p>
                </div>
                <button
                  onClick={() => setIsAttrModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F7F5] border border-[#EAEAEA] hover:bg-[#EAEAEA] text-[#111111] font-bold text-xs rounded-lg transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Attribute
                </button>
              </div>

              {/* Attribute Definitions List */}
              <div className="space-y-3">
                {selectedType.attributeDefinitions.length === 0 ? (
                  <div className="p-6 bg-[#F7F7F5] border border-dashed border-[#EAEAEA] rounded-xl text-center">
                    <Sparkles className="w-6 h-6 text-[#6B6B6B] mx-auto mb-2" />
                    <p className="text-xs font-bold text-[#111111]">No Custom Attributes Configured</p>
                    <p className="text-[10px] text-[#6B6B6B] mt-1 max-w-sm mx-auto">
                      For standard tiles, core fields (Size, Finish, Brand) are used. Click "Add Attribute" to add custom fields (e.g. Colour, Coverage, Setting Time).
                    </p>
                  </div>
                ) : (
                  selectedType.attributeDefinitions.map((attr) => (
                    <div
                      key={attr.id}
                      className="flex items-center justify-between p-3.5 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#111111]">{attr.name}</span>
                          <code className="text-[10px] text-[#8A7300] bg-[#F2C202]/10 px-1.5 py-0.5 rounded font-mono">
                            {attr.key}
                          </code>
                          {attr.isRequired && (
                            <span className="px-1.5 py-0.2 text-[9.5px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#6B6B6B]">
                          <span>Type: <strong className="text-[#111111]">{attr.dataType}</strong></span>
                          {attr.unit && <span>Unit: <strong className="text-[#111111]">{attr.unit}</strong></span>}
                          {attr.options && (
                            <span className="truncate max-w-[200px]">Options: {JSON.stringify(attr.options)}</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteAttribute(attr.id)}
                        disabled={deletingAttrId === attr.id}
                        className="p-1.5 text-[#6B6B6B] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-12 text-center text-[#6B6B6B] text-xs">
              Select a Product Type from the list to manage options.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create/Edit Product Type */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EAEAEA] w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-black uppercase text-[#111111]">
              {editingType ? "Edit Product Type" : "Create Product Type"}
            </h3>
            <form onSubmit={handleSaveType} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#111111] mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paints, Sanitary, Faucets"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111111] mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Short summary of products under this category..."
                  value={typeDescription}
                  onChange={(e) => setTypeDescription(e.target.value)}
                  className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Icon Identifier</label>
                  <input
                    type="text"
                    placeholder="Boxes, Paintbrush, Bath"
                    value={typeIcon}
                    onChange={(e) => setTypeIcon(e.target.value)}
                    className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={typeSortOrder}
                    onChange={(e) => setTypeSortOrder(Number(e.target.value))}
                    className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:text-[#111111]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#F2C202] hover:bg-[#D8AD02] text-white font-black text-xs rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Product Type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Attribute Definition */}
      {isAttrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EAEAEA] w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-black uppercase text-[#111111]">Add Attribute Definition</h3>
            <form onSubmit={handleSaveAttribute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#111111] mb-1">Attribute Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Colour, Coverage, Setting Time"
                  value={attrName}
                  onChange={(e) => {
                    setAttrName(e.target.value);
                    setAttrKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "_"));
                  }}
                  className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Key Identifier</label>
                  <input
                    type="text"
                    required
                    placeholder="colour"
                    value={attrKey}
                    onChange={(e) => setAttrKey(e.target.value)}
                    className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Data Type</label>
                  <select
                    value={attrDataType}
                    onChange={(e) => setAttrDataType(e.target.value)}
                    className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="select">Select Options</option>
                  </select>
                </div>
              </div>

              {attrDataType === "select" && (
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Select Options (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="Matt, Glossy, Silk, Satin"
                    value={attrOptions}
                    onChange={(e) => setAttrOptions(e.target.value)}
                    className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#111111] mb-1">Measurement Unit (Optional)</label>
                <input
                  type="text"
                  placeholder="L, Kg, sq.ft/L, mm"
                  value={attrUnit}
                  onChange={(e) => setAttrUnit(e.target.value)}
                  className="w-full bg-white border border-[#EAEAEA] rounded-xl px-3.5 py-2 text-xs text-[#111111] focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="attrRequired"
                  checked={attrIsRequired}
                  onChange={(e) => setAttrIsRequired(e.target.checked)}
                  className="accent-[#F2C202]"
                />
                <label htmlFor="attrRequired" className="text-xs font-medium text-[#111111] cursor-pointer">
                  Required field during Product Creation
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAttrModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:text-[#111111]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#F2C202] hover:bg-[#D8AD02] text-white font-black text-xs rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Attribute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
