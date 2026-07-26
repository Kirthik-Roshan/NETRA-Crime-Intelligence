"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="btn-accent no-print">
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
