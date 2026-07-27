import { all } from "@/lib/db";
import { networkGraph } from "@/lib/queries";
import { PageHeader, Badge } from "@/components/ui";
import { NetworkExplorer } from "@/components/network/NetworkExplorer";
import { Sparkles } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import type { GraphEdge, GraphNode } from "@/lib/types";

// Static export: every criminal's ego-network is precomputed at build and
// passed to the client explorer, which switches focus in-memory (no runtime
// /api/network fetch).
export default function NetworkPage() {
  const t = getT();
  const options = all<{ id: number; name: string; risk_score: number; home_district: string }>(
    "SELECT id, name, risk_score, home_district FROM criminals ORDER BY risk_score DESC"
  );
  const graphs: Record<string, { nodes: GraphNode[]; edges: GraphEdge[] }> = {
    top: networkGraph(undefined, 1),
  };
  for (const o of options) graphs[String(o.id)] = networkGraph(o.id, 1);

  return (
    <div>
      <PageHeader title={t("network.title")} subtitle={t("network.subtitle")}>
        <Badge tone="accent"><Sparkles className="h-3 w-3" /> {t("network.engine")}</Badge>
      </PageHeader>
      <NetworkExplorer options={options} graphs={graphs} />
    </div>
  );
}
