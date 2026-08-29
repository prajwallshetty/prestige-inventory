import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getProductFormOptions } from "@/services/ProductService";
import { ProductForm } from "@/components/admin/products/ProductForm";

export const revalidate = 0;

export default async function NewProductPage() {
  const session = await getSessionContext();
  if (session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const options = await getProductFormOptions();

  return <ProductForm mode="create" options={options} />;
}
