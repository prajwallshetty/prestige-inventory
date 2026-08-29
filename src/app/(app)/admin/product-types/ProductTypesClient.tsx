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
import { toast } from "sonner";

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
    }
  };

  const handleToggleStatus = async (pt: ProductTypeItem) => {
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
    }
  };

  const handleSaveAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !attrName.trim()) {
      toast.error("Attribute name is required");
      return;
    }

    const key = attrKey.trim() || attrName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const parsedOptions = attrOptions.trim()
      ? attrOptions.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

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

      // Update state
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
    }
  };

  const handleDeleteAttribute = async (attrId: string) => {
    if (!selectedType) return;
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
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider mb-1">
            <Layers className="w-4 h-4" /> Multi-Category ERP Configuration
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Product Types & Architecture</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage product categories (Tiles, Sanitary, Paints, Adhesives, Bath Fittings) & dynamic EAV attributes.
          </p>
        </div>
        <button
          onClick={openCreateTypeModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-600/25"
        >
          <Plus className="w-4 h-4" /> Add Product Type
        </button>
      </div>

      {/* Main Grid: Left List / Right Attributes Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Types List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search product types..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
            {filteredTypes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No product types found.</div>
            ) : (
              filteredTypes.map((pt) => {
                const isSelected = selectedType?.id === pt.id;
                return (
                  <div
                    key={pt.id}
                    onClick={() => setSelectedType(pt)}
                    className={`p-4 cursor-pointer transition flex items-center justify-between group ${
                      isSelected
                        ? "bg-indigo-600/10 border-l-4 border-indigo-500"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${
                        isSelected
                          ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}>
                        <Boxes className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`font-semibold text-sm ${isSelected ? "text-white" : "text-slate-200"}`}>
                            {pt.name}
                          </h3>
                          {!pt.isActive && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {pt.description || "No description specified"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg">
                        {pt._count.products} Products
                      </span>
                      <ChevronRight className={`w-4 h-4 transition ${isSelected ? "text-indigo-400 translate-x-0.5" : "text-slate-600"}`} />
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              {/* Header Info */}
              <div className="flex items-start justify-between pb-6 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                      Slug: {selectedType.slug}
                    </span>
                    <span className="text-xs text-slate-500">Order: #{selectedType.sortOrder}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedType.name}</h2>
                  <p className="text-slate-400 text-sm">{selectedType.description || "No description"}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditTypeModal(selectedType)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                    title="Edit Product Type"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(selectedType)}
                    className={`p-2 rounded-xl transition ${
                      selectedType.isActive
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
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
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-indigo-400" /> Dynamic Attribute Definitions
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fields automatically rendered on Product creation forms for {selectedType.name}.
                  </p>
                </div>
                <button
                  onClick={() => setIsAttrModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 font-medium text-xs rounded-lg transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Attribute
                </button>
              </div>

              {/* Attribute Definitions List */}
              <div className="space-y-3">
                {selectedType.attributeDefinitions.length === 0 ? (
                  <div className="p-6 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl text-center">
                    <Sparkles className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-400">No Custom Attributes Configured</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      For standard tiles, core fields (Size, Finish, Brand) are used. Click "Add Attribute" to add custom fields (e.g. Colour, Coverage, Setting Time).
                    </p>
                  </div>
                ) : (
                  selectedType.attributeDefinitions.map((attr) => (
                    <div
                      key={attr.id}
                      className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{attr.name}</span>
                          <code className="text-[11px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded font-mono">
                            {attr.key}
                          </code>
                          {attr.isRequired && (
                            <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>Type: <strong className="text-slate-300">{attr.dataType}</strong></span>
                          {attr.unit && <span>Unit: <strong className="text-slate-300">{attr.unit}</strong></span>}
                          {attr.options && (
                            <span className="truncate max-w-[200px]">Options: {JSON.stringify(attr.options)}</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteAttribute(attr.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              Select a Product Type from the list to manage options.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create/Edit Product Type */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {editingType ? "Edit Product Type" : "Create Product Type"}
            </h3>
            <form onSubmit={handleSaveType} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paints, Sanitary, Faucets"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Short summary of products under this category..."
                  value={typeDescription}
                  onChange={(e) => setTypeDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Icon Identifier</label>
                  <input
                    type="text"
                    placeholder="Boxes, Paintbrush, Bath"
                    value={typeIcon}
                    onChange={(e) => setTypeIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={typeSortOrder}
                    onChange={(e) => setTypeSortOrder(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg"
                >
                  Save Product Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Attribute Definition */}
      {isAttrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Add Attribute Definition</h3>
            <form onSubmit={handleSaveAttribute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Attribute Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Colour, Coverage, Setting Time"
                  value={attrName}
                  onChange={(e) => {
                    setAttrName(e.target.value);
                    setAttrKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "_"));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Key Identifier</label>
                  <input
                    type="text"
                    required
                    placeholder="colour"
                    value={attrKey}
                    onChange={(e) => setAttrKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Data Type</label>
                  <select
                    value={attrDataType}
                    onChange={(e) => setAttrDataType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Select Options (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="Matt, Glossy, Silk, Satin"
                    value={attrOptions}
                    onChange={(e) => setAttrOptions(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Measurement Unit (Optional)</label>
                <input
                  type="text"
                  placeholder="L, Kg, sq.ft/L, mm"
                  value={attrUnit}
                  onChange={(e) => setAttrUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="attrRequired"
                  checked={attrIsRequired}
                  onChange={(e) => setAttrIsRequired(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="attrRequired" className="text-xs text-slate-300">
                  Required field during Product Creation
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAttrModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg"
                >
                  Save Attribute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
