import { DEFAULT_CAPITAL, DEFAULT_RISK, type DeskRisk } from "@/lib/desk/types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRisk(input?: Partial<DeskRisk> | null): DeskRisk {
  return {
    positionPct: clamp(finite(input?.positionPct, DEFAULT_RISK.positionPct), 0.01, 1),
    stopPct: clamp(finite(input?.stopPct, DEFAULT_RISK.stopPct), 0.001, 0.5),
    takeProfitPct: clamp(finite(input?.takeProfitPct, DEFAULT_RISK.takeProfitPct), 0.001, 1),
    dailyLossPct: clamp(finite(input?.dailyLossPct, DEFAULT_RISK.dailyLossPct), 0.005, 0.5),
    maxPositions: 1,
  };
}

export function normalizeCapital(value: number | undefined): number {
  const next = finite(value, DEFAULT_CAPITAL);
  return clamp(next, 100, 100_000_000);
}

function finite(value: number | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}
