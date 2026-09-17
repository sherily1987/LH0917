const zh = "zh-CN";

export function formatPrice(value: number, currency = "USD"): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(zh, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(zh, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, digits = 2, signed = true): string {
  if (!Number.isFinite(value)) return "—";
  const body = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return body;
  if (value > 0) return `+${body}`;
  return body;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(zh, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(ts * 1000);
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat(zh, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ts * 1000);
}

export function signedClass(value: number): string {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-muted-foreground";
}
