import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  const user = getSession();
  audit({ user, action: "USER_LOGOUT" });
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
