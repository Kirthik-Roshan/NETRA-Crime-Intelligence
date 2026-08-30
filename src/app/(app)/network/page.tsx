import { all } from "@/lib/db";
import { networkGraph } from "@/lib/queries";
import { PageHeader, Badge } from "@/components/ui";
import { CloudNetworkWorkspace } from "@/components/network/CloudNetworkWorkspace";
import { Sparkles, Users } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import type { CloudNetwork } from "@/lib/cloud-network";

// Static export: every criminal's ego-network is precomputed at build and
// passed to the client explorer, which switches focus in-memory (no runtime
// /api/network fetch).
export default function NetworkPage() {
  const t = getT();
  const options = all<CloudNetwork["options"][number]>("SELECT id, name, risk_score, home_district FROM criminals ORDER BY risk_score DESC");
  const fallback: CloudNetwork = { options, graphs: { top: networkGraph(undefined, 1) } };
  for (const option of options) fallback.graphs[String(option.id)] = networkGraph(option.id, 1);

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("network.title")} subtitle={t("network.subtitle")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted"><Users className="h-3 w-3" /> <span className="tabular-nums">{options.length}</span> profiles indexed</Badge>
          <Badge tone="accent"><Sparkles className="h-3 w-3" /> {t("network.engine")}</Badge>
        </div>
      </PageHeader>
      <CloudNetworkWorkspace fallback={fallback} />
    </div>
  );
}
