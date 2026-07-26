import { all, get } from "@/lib/db";
import { networkGraph } from "@/lib/queries";
import { PageHeader, Badge } from "@/components/ui";
import { NetworkExplorer } from "@/components/network/NetworkExplorer";
import { Sparkles } from "lucide-react";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default function NetworkPage({ searchParams }: { searchParams: { focus?: string } }) {
  const t = getT();
  const focus = searchParams.focus ? Number(searchParams.focus) : undefined;
  const options = all<{ id: number; name: string; risk_score: number; home_district: string }>(
    "SELECT id, name, risk_score, home_district FROM criminals ORDER BY risk_score DESC"
  );
  const initialGraph = networkGraph(focus, 1);
  const focusName = focus ? get<{ name: string }>("SELECT name FROM criminals WHERE id=?", [focus])?.name : undefined;

  return (
    <div>
      <PageHeader title={t("network.title")} subtitle={t("network.subtitle")}>
        <Badge tone="accent"><Sparkles className="h-3 w-3" /> {t("network.engine")}</Badge>
      </PageHeader>
      <NetworkExplorer options={options} initialGraph={initialGraph} initialId={focus} initialName={focusName} />
    </div>
  );
}
