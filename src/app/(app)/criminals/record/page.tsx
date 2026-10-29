import { Suspense } from "react";
import { CriminalRecordWorkspace } from "@/components/criminals/CriminalRecordWorkspace";

export default function CriminalRecordPage() {
  return (
    <Suspense fallback={null}>
      <CriminalRecordWorkspace />
    </Suspense>
  );
}
