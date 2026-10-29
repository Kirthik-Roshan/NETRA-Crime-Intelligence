import { Suspense } from "react";
import { InvestigationWorkbench } from "@/components/investigations/InvestigationWorkbench";

export default function InvestigationsPage() {
  return <Suspense fallback={null}><InvestigationWorkbench /></Suspense>;
}
