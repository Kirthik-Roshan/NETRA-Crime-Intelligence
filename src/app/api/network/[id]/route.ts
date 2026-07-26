import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { networkGraph } from "@/lib/queries";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = params.id === "top" ? undefined : Number(params.id);
  const graph = networkGraph(id, 1);
  audit({ user, action: "NETWORK_VIEWED", entity: "criminal", entity_id: id ?? "top" });
  return NextResponse.json(graph);
}
