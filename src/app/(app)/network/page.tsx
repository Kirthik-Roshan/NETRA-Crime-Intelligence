import { UiText } from '@/components/UiText';
import { PageHeader, Badge } from "@/components/ui";
import { CloudNetworkWorkspace } from "@/components/network/CloudNetworkWorkspace";
import { Sparkles, Users } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import type { CloudNetwork } from "@/lib/cloud-network";

export default function NetworkPage() {
  const t = getT();
  const fallback: CloudNetwork = { options: [], graphs: { top: { nodes: [], edges: [] } } };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("network.title")} subtitle={t("network.subtitle")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted"><Users className="h-3 w-3" /><UiText text={" Official KSP accused profiles"} /></Badge>
          <Badge tone="accent"><Sparkles className="h-3 w-3" /> {t("network.engine")}</Badge>
        </div>
      </PageHeader>
      <CloudNetworkWorkspace fallback={fallback} />
    </div>
  );
}
