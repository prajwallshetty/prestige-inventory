import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getProducts, getProductFormOptions } from "@/services/ProductService";
import { ProductsClient } from "@/components/admin/products/ProductsClient";

export const revalidate = 0;

export default async function AdminProductsPage() {
  const session = await getSessionContext();

  // Protect at page level in case middleware is ever bypassed.
  if (session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const [productsData, options] = await Promise.all([
    getProducts({ page: 1, limit: 24 }),
    getProductFormOptions(),
  ]);

  return <ProductsClient initialData={JSON.parse(JSON.stringify(productsData))} options={options} />;
}
