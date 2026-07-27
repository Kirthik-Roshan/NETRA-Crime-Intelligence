import { all } from "@/lib/db";
import { CasesList, type CaseRow } from "@/components/cases/CasesList";

// Static export: bake every case; filtering happens client-side in CasesList.
export default function CasesPage() {
  const cases = all<CaseRow>(
    `SELECT c.id, c.case_number, c.title, c.status, c.priority, c.district, c.updated_at, c.officer,
            f.crime_type
     FROM cases c LEFT JOIN firs f ON f.id=c.fir_id
     ORDER BY (c.priority='critical') DESC, c.updated_at DESC`
  );
  return <CasesList cases={cases} />;
}
