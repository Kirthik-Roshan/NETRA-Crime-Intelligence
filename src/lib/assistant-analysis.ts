import type { InvestigationAnalysis, InvestigationExclusion } from './investigations';
import type { FirPoint } from '@/components/maps/CrimeMap';

export interface AnalysisContext {
  districts: string[]; offences: string[]; profile_id: number | null;
  statuses: string[]; severity: string | null; end_date: string | null;
  days: number | null; year: number | null;
  view: 'bar' | 'line' | 'pie' | 'map' | 'graph' | 'comparison' | 'warnings' | 'periods';
  group: 'district' | 'crime_type' | 'month'; case_ids: number[];
  exclusions: InvestigationExclusion[];
}
export interface AnalysisRecord { id: number; fir_number: string; crime_type: string; district: string; occurred_at: string }
export interface AssistantAnalysis {
  version: string; context: AnalysisContext; scope: string; total: number;
  generated_at: string; fingerprint: string;
  latest_incident: string | null;
  rows: Array<{ label: string; count: number; case_ids: number[] }>;
  records: AnalysisRecord[]; records_truncated: boolean;
  points: FirPoint[]; points_truncated: boolean;
  sources: Array<{ id: number; fir_number: string }>;
  warnings: string[];
  periods: null | {
    current: number; previous: number; current_start: string; current_end: string;
    previous_start: string; previous_end: string;
    previous_sources: Array<{ id: number; fir_number: string }>;
    changes: Array<{ label: string; current: number; previous: number; delta: number; percent: number | null; flagged: boolean }>;
  };
  comparison: InvestigationAnalysis | null;
}
