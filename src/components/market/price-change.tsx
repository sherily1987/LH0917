import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

export function PriceChange({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted-foreground";
  return (
    <span className={cn("font-mono tabular-nums", tone, className)}>
      {formatPercent(value)}
    </span>
  );
}
