"use client";

import DATABASE_SNAPSHOT from "@/data/db-baked.json";

export interface SnapshotTable {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

const TABLE_ALIASES: Record<string, string> = {
  Firs: "firs",
  Cases: "cases",
  Criminals: "criminals",
  FirCriminals: "intel_accused_link",
  Arrests: "arrests",
  Victims: "victims",
  Complainants: "complainants",
  Evidence: "evidence",
  Relationships: "relationships",
  Phones: "phones",
  Vehicles: "vehicles",
  Addresses: "addresses",
  Weapons: "weapons",
  Organizations: "organizations",
  OrgMembers: "org_members",
  PoliceStations: "police_stations",
  Chargesheets: "ChargesheetDetails",
  AuditLogs: "audit_logs",
};

const TABLES = DATABASE_SNAPSHOT.tables as unknown as Record<string, SnapshotTable>;

export function getRecordSnapshot(table: string): SnapshotTable | null {
  const found = TABLES[TABLE_ALIASES[table] || table];
  return found ? { ...found, table } : null;
}

export function getSnapshotRows(table: string, max = 5000): Record<string, unknown>[] {
  return getRecordSnapshot(table)?.rows.slice(0, Math.max(1, max)) || [];
}

export function getSnapshotCount(table: string): number {
  return getRecordSnapshot(table)?.total || 0;
}
