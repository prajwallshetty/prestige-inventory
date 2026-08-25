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

  let product;
  try {
    product = await getProductById(id, { includeDeleted: true });
  } catch {
    notFound();
  }

  const options = await getProductFormOptions();

  return <ProductForm mode="edit" product={JSON.parse(JSON.stringify(product))} options={options} />;
}
