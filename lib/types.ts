// Canonical payload contract. Matches the shape produced by pipeline/collect.py
// (build_payload) and consumed by the static dashboard.

export type ISO8601 = string;
export type LevelKey = 'LSO100' | 'LSO200';
export type Basis = 'effective_hours' | 'calendar_days';
export type Unit = 'hours' | 'days';
export type PayloadSource = 'seed' | 'confirmed';
export type RegionMapStatus = 'pending' | 'partial' | 'complete';

export interface MetricDef {
  basis: Basis;
  budget: number;       // 112 (hours) or 45 (days)
  unit: Unit;
  clock_from: string;   // "hire"
}

export interface MetricCell {
  numerator: number;     // earned the cert ON TIME
  denominator: number;   // entered that level's training
  rate: number;          // numerator / denominator, 0..1 (0 when denominator 0)
  completed: number;     // earned the cert at all (any time)
  in_progress: number;   // denominator - completed (the in-progress proxy)
  anomalies?: number;    // completers excluded from on-time (pre-hire / undated)
}

export interface RegionCell extends MetricCell {
  region: string;        // "Pending" for the ungrouped bucket
  pending: boolean;      // region not yet mapped in region_map.csv
  store_count: number;
}

export interface Metric {
  level: LevelKey;
  title: string;
  definition: MetricDef;
  denominator_def: string;
  overall: MetricCell;
  by_region: RegionCell[];
}

export interface StoreRow {
  store: string;
  region: string;        // mapped region, or "pending"
  lso100_denominator: number;
  lso200_denominator: number;
}

export interface PayloadMeta {
  board_id: string;
  generated_at: ISO8601;
  generated_by: string;
  tz: string;
  tenant: string;
  source: PayloadSource;
  region_map_status: RegionMapStatus;
  metrics_def: Record<string, MetricDef>;
  denominator_def: Record<string, string>;
  sources: { roster: string; cert: string; hours: string };
  data_notes: Record<string, number>;
}

export interface Payload {
  meta: PayloadMeta;
  metrics: Metric[];     // [LSO100, LSO200]
  regions: string[];     // distinct region labels present (incl. "Pending")
  stores: StoreRow[];
}
