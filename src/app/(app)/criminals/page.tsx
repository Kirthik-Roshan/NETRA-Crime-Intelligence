import { all } from "@/lib/db";
import { CriminalsList, type CrimRow } from "@/components/criminals/CriminalsList";

// Static export: bake every criminal; search + risk filter run client-side.
export default function CriminalsPage() {
  const criminals = all<CrimRow>(
    `SELECT c.id, c.name, c.aliases, c.age, c.gender, c.status, c.risk_score, c.crime_category, c.home_district,
            (SELECT COUNT(*) FROM fir_criminals fc WHERE fc.criminal_id=c.id) AS fir_count,
            (SELECT COUNT(*) FROM arrests a WHERE a.criminal_id=c.id) AS arrest_count
     FROM criminals c ORDER BY c.risk_score DESC`
  );
  return <CriminalsList criminals={criminals} />;
}
