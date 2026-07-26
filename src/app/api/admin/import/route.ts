import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { importCsv, CSV_TEMPLATE } from "@/lib/importer";

export const dynamic = "force-dynamic";

// GET → download the CSV template
export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return new NextResponse(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="netra-fir-import-template.csv"',
    },
  });
}

// POST → import CSV (administrators only)
export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator") {
    return NextResponse.json({ error: "Only administrators can import data." }, { status: 403 });
  }
  const { csv } = await req.json().catch(() => ({}));
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "csv text required" }, { status: 400 });
  }
  const result = importCsv(csv);
  audit({
    user,
    action: "DATA_IMPORTED",
    entity: "casemaster",
    detail: `${result.inserted} FIRs imported, ${result.skipped} skipped, ${result.errors.length} errors`,
  });
  return NextResponse.json(result);
}
