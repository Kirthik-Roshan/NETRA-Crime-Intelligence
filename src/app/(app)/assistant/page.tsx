import { Suspense } from "react";
import { AssistantClient } from "@/components/assistant/AssistantClient";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading assistant…</div>}>
      <AssistantClient />
    </Suspense>
  );
}
