import { db } from "../src/lib/db";

async function main() {
  const users = await db.user.findMany();
  console.log("USERS IN DB:", users.map(u => ({ email: u.email, role: u.role, name: u.name, status: u.status })));
}

main();
