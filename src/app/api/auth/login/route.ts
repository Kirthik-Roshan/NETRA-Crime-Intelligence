import { NextResponse } from "next/server";
import { authenticate, createSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  const user = authenticate(String(username), String(password));
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  createSessionCookie(user);
  audit({ user, action: "USER_LOGIN", entity: "user", entity_id: user.id });
  return NextResponse.json({ ok: true, user });
}
