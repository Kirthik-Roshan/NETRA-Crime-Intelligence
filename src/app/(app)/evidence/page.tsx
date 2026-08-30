import { EvidenceLab } from "@/components/evidence/EvidenceLab";
import { PageHeader } from "@/components/ui";
import { RoleBadge } from "@/components/OfficerName";

export default function EvidencePage() {
  return (
    <div>
      <PageHeader
        title="Evidence Intelligence"
        subtitle="Catalyst Zia analysis with Stratus originals, Cloud Scale metadata, and immutable audit records"
      >
        <RoleBadge />
      </PageHeader>
      <EvidenceLab />
    </div>
  );
}
