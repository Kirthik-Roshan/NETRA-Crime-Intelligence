import { Database } from "lucide-react";
import { PageHeader, Badge } from "@/components/ui";
import { DatabaseExplorer } from "@/components/database/DatabaseExplorer";
import { getT } from "@/lib/i18n-server";

export default function DatabasePage() {
  const t = getT();
  return (
    <div>
      <PageHeader title={t("database.title")} subtitle={t("database.subtitle")}>
        <Badge tone="accent"><Database className="h-3 w-3" /> read-only</Badge>
      </PageHeader>
      <DatabaseExplorer />
    </div>
  );
}
