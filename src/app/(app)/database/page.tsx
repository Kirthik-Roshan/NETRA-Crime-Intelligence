import { UiText } from '@/components/UiText';
import { Database } from "lucide-react";
import { PageHeader, Badge } from "@/components/ui";
import { DatabaseExplorer } from "@/components/database/DatabaseExplorer";
import { getT } from "@/lib/i18n-server";
import { CaseJournal } from "@/components/database/CaseJournal";

export default function DatabasePage() {
  const t = getT();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t("database.title")} subtitle={t("database.subtitle")}>
        <Badge tone="accent"><Database className="h-3 w-3" /><UiText text={" read-only"} /></Badge>
      </PageHeader>
      <CaseJournal />
      <DatabaseExplorer />
    </div>
  );
}
