import { getProductTypes } from "@/services/ProductTypeService";
import ProductTypesClient from "./ProductTypesClient";

export const metadata = {
  title: "Product Types & ERP Categories | Prestige Inventory",
  description: "Manage multi-category building material ERP product types and dynamic attributes.",
};

export default async function AdminProductTypesPage() {
  const rawTypes = await getProductTypes(false);

  const productTypes = rawTypes.map((pt) => ({
    id: pt.id,
    name: pt.name,
    slug: pt.slug,
    description: pt.description,
    icon: pt.icon,
    isActive: pt.isActive,
    sortOrder: pt.sortOrder,
    attributeDefinitions: pt.attributeDefinitions.map((a) => ({
      id: a.id,
      name: a.name,
      key: a.key,
      dataType: a.dataType,
      unit: a.unit,
      options: a.options ? (typeof a.options === "string" ? JSON.parse(a.options) : a.options) : null,
      isRequired: a.isRequired,
      isFilterable: a.isFilterable,
      sortOrder: a.sortOrder,
    })),
    _count: { products: pt._count.products },
  }));

  return <ProductTypesClient initialProductTypes={productTypes} />;
}
