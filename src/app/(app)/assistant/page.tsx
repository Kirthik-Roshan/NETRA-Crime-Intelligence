import { UiText } from '@/components/UiText';
import { Suspense } from "react";
import { AssistantClient } from "@/components/assistant/AssistantClient";


export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted"><UiText text={"Loading assistant…"} /></div>}>
      <AssistantClient />
    </Suspense>
  );
}
