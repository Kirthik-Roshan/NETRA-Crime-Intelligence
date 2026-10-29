import { Suspense } from "react";
import { CaseRecordWorkspace } from "@/components/cases/CaseRecordWorkspace";

export default function CaseRecordPage() {
  return (
    <Suspense fallback={null}>
      <CaseRecordWorkspace />
    </Suspense>
  );
}
