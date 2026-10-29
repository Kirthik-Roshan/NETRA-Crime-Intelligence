"use client";
import { UiText } from '@/components/UiText';

import { Printer } from "lucide-react";

export function PrintButton({ label = "Export PDF", onExport }: { label?: string; onExport: () => void }) {
  return (
    <button onClick={onExport} className="btn-accent no-print">
      <Printer className="h-4 w-4" /> <UiText text={label} />
    </button>
  );
}
