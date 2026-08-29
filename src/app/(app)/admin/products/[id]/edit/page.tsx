import { redirect, notFound } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getProductById, getProductFormOptions } from "@/services/ProductService";
import { ProductForm } from "@/components/admin/products/ProductForm";

export const revalidate = 0;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const { id } = await params;

  // Independent reads — parallel rather than sequential (each round trip to
  // the database costs ~2s here, see docs/AUDIT.md J1).
  const [product, options] = await Promise.all([
    getProductById(id, { includeDeleted: true }).catch(() => null),
    getProductFormOptions(),
  ]);

  if (!product) {
    notFound();
  }

  return <ProductForm mode="edit" product={JSON.parse(JSON.stringify(product))} options={options} />;
}
