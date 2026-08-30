import { db } from "@/lib/db";

/**
 * Generates a clean, professional, unique Login Code based on user role & showroom.
 *
 * Examples:
 *   SUPER_ADMIN        -> ADM-001, ADM-002
 *   MANAGER            -> MGR-001, MGR-002
 *   SHOWROOM_INCHARGE  -> SH01-IC-001, SH02-IC-001
 *   SHOWROOM_STAFF     -> SH01-ST-001, SH02-ST-001
 *   WEAVER             -> WVR-001, WVR-002
 */
export async function generateUniqueLoginCode(
  role: string,
  showroomId?: string | null
): Promise<string> {
  let prefix = "USR";

  if (role === "SUPER_ADMIN") {
    prefix = "ADM";
  } else if (role === "MANAGER") {
    prefix = "MGR";
  } else if (role === "SHOWROOM_INCHARGE" || role === "SHOWROOM_STAFF") {
    const roleCode = role === "SHOWROOM_INCHARGE" ? "IC" : "ST";
    let showroomNum = "";

    if (showroomId) {
      const showroom = await db.showroom.findUnique({
        where: { id: showroomId },
        select: { name: true, city: true },
      });

      if (showroom) {
        // Try extracting number from name like "Showroom 1" -> "01"
        const match = (showroom.name || "").match(/\d+/);
        if (match) {
          showroomNum = match[0].padStart(2, "0");
        } else if (showroom.name) {
          showroomNum = showroom.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        }
      }
    }

    prefix = showroomNum ? `SH${showroomNum}-${roleCode}` : `SH-${roleCode}`;
  } else if (role === "WEAVER") {
    prefix = "WVR";
  }

  // Find all existing loginCodes starting with prefix
  const existingUsers = await db.user.findMany({
    where: {
      loginCode: {
        startsWith: prefix,
      },
    },
    select: { loginCode: true },
  });

  // Extract integer counters
  const maxSeq = existingUsers.reduce((max, u) => {
    if (!u.loginCode) return max;
    const parts = u.loginCode.split("-");
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart, 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);

  let seq = maxSeq + 1;
  let code = `${prefix}-${String(seq).padStart(3, "0")}`;

  // Database-level uniqueness loop guard
  while (await db.user.findFirst({ where: { loginCode: code } })) {
    seq++;
    code = `${prefix}-${String(seq).padStart(3, "0")}`;
  }

  return code;
}
