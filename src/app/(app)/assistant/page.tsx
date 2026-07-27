import { Suspense } from "react";
import { AssistantClient } from "@/components/assistant/AssistantClient";


export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading assistant…</div>}>
      <AssistantClient />
    </Suspense>
  );
}
