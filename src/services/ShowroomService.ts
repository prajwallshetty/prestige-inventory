import { db } from "@/lib/db";
import { invalidateCache } from "@/lib/redis";
import { Prisma } from "@prisma/client";

async function generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let slug = base || "showroom";
  let counter = 1;
  while (true) {
    const exists = await db.showroom.findUnique({ where: { slug } });
    if (!exists || exists.id === excludeId) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}

export async function listShowrooms() {
  return db.showroom.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { dealers: true, users: true, bookings: true } },
    },
  });
}

export async function createShowroom({
  name,
  subtitle,
  addressLine,
  locality,
  city,
  state = "Karnataka",
  postalCode,
  phone,
  whatsapp,
  email,
  managerName,
  managerPhone,
  isFlagship = false,
  published = true,
  createdById,
  createdByName,
}: {
  name: string;
  subtitle?: string | null;
  addressLine: string;
  locality?: string | null;
  city: string;
  state?: string;
  postalCode?: string | null;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  isFlagship?: boolean;
  published?: boolean;
  createdById?: string | null;
  createdByName?: string;
}) {
  if (!name?.trim()) throw new Error("Showroom name is required.");
  if (!addressLine?.trim()) throw new Error("Address is required.");
  if (!city?.trim()) throw new Error("City is required.");
  if (!phone?.trim()) throw new Error("Contact phone is required.");

  const slug = await generateUniqueSlug(name);

  const showroom = await db.showroom.create({
    data: {
      slug,
      name: name.trim(),
      subtitle: subtitle?.trim() || null,
      addressLine: addressLine.trim(),
      locality: locality?.trim() || null,
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode?.trim() || null,
      phone: phone.trim(),
      whatsapp: whatsapp?.trim() || null,
      email: email?.trim().toLowerCase() || null,
      managerName: managerName?.trim() || null,
      managerPhone: managerPhone?.trim() || null,
      isFlagship,
      published,
      createdById: createdById || null,
    },
  });

  await db.auditLog.create({
    data: {
      action: "CREATE_SHOWROOM",
      entity: "Showroom",
      entityId: showroom.id,
      userId: createdById || null,
      newValue: { name: showroom.name, slug: showroom.slug, city: showroom.city },
      meta: { performedBy: createdByName || "Super Admin" },
    },
  });

  await invalidateCache("showrooms:*");
  return showroom;
}

export async function updateShowroom({
  id,
  name,
  subtitle,
  addressLine,
  locality,
  city,
  state,
  postalCode,
  phone,
  whatsapp,
  email,
  managerName,
  managerPhone,
  isFlagship,
  published,
  updatedById,
  updatedByName,
}: {
  id: string;
  name?: string;
  subtitle?: string | null;
  addressLine?: string;
  locality?: string | null;
  city?: string;
  state?: string;
  postalCode?: string | null;
  phone?: string;
  whatsapp?: string | null;
  email?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  isFlagship?: boolean;
  published?: boolean;
  updatedById?: string | null;
  updatedByName?: string;
}) {
  const existing = await db.showroom.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Showroom not found.");

  let slug = existing.slug;
  if (name && name.trim() !== existing.name) {
    slug = await generateUniqueSlug(name, id);
  }

  const updated = await db.showroom.update({
    where: { id },
    data: {
      slug,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(subtitle !== undefined ? { subtitle: subtitle?.trim() || null } : {}),
      ...(addressLine !== undefined ? { addressLine: addressLine.trim() } : {}),
      ...(locality !== undefined ? { locality: locality?.trim() || null } : {}),
      ...(city !== undefined ? { city: city.trim() } : {}),
      ...(state !== undefined ? { state: state.trim() } : {}),
      ...(postalCode !== undefined ? { postalCode: postalCode?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone.trim() } : {}),
      ...(whatsapp !== undefined ? { whatsapp: whatsapp?.trim() || null } : {}),
      ...(email !== undefined ? { email: email?.trim().toLowerCase() || null } : {}),
      ...(managerName !== undefined ? { managerName: managerName?.trim() || null } : {}),
      ...(managerPhone !== undefined ? { managerPhone: managerPhone?.trim() || null } : {}),
      ...(isFlagship !== undefined ? { isFlagship } : {}),
      ...(published !== undefined ? { published } : {}),
      updatedById: updatedById || null,
    },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE_SHOWROOM",
      entity: "Showroom",
      entityId: id,
      userId: updatedById || null,
      oldValue: { name: existing.name, city: existing.city, published: existing.published },
      newValue: { name: updated.name, city: updated.city, published: updated.published },
      meta: { performedBy: updatedByName || "Super Admin" },
    },
  });

  await invalidateCache("showrooms:*");
  return updated;
}

export async function deleteShowroom({
  id,
  deletedById,
  deletedByName,
}: {
  id: string;
  deletedById?: string | null;
  deletedByName?: string;
}) {
  const existing = await db.showroom.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Showroom not found.");

  // Check dependencies
  const [usersCount, dealersCount, bookingsCount, stockBlocksCount] = await Promise.all([
    db.user.count({ where: { showroomId: id } }),
    db.dealer.count({ where: { showroomId: id } }),
    db.booking.count({ where: { showroomId: id } }),
    db.stockBlock.count({
      where: {
        showroomId: id,
        status: { notIn: ["CANCELLED", "RELEASED", "DELIVERED", "REJECTED", "EXPIRED"] },
      },
    }),
  ]);

  if (usersCount > 0) {
    throw new Error(`Cannot delete showroom: has ${usersCount} assigned users.`);
  }
  if (dealersCount > 0) {
    throw new Error(`Cannot delete showroom: has ${dealersCount} assigned dealers.`);
  }
  if (bookingsCount > 0) {
    throw new Error(`Cannot delete showroom: has ${bookingsCount} client bookings.`);
  }
  if (stockBlocksCount > 0) {
    throw new Error(`Cannot delete showroom: has ${stockBlocksCount} active stock blocks.`);
  }

  // Soft delete
  const deleted = await db.showroom.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: deletedById || null,
    },
  });

  await db.auditLog.create({
    data: {
      action: "DELETE_SHOWROOM",
      entity: "Showroom",
      entityId: id,
      userId: deletedById || null,
      oldValue: { name: existing.name, slug: existing.slug },
      newValue: Prisma.DbNull,
      meta: { performedBy: deletedByName || "Super Admin" },
    },
  });

  await invalidateCache("showrooms:*");
  return deleted;
}
