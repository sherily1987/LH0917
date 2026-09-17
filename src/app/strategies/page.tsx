import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STRATEGIES } from "@/lib/quant/strategies";

export const metadata: Metadata = { title: "策略" };

export default function StrategiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">策略</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每套策略都是可参数化的仓位规则：在当日收盘生成目标仓位，下一根 K 线开盘成交。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {STRATEGIES.map((strategy) => (
          <Card key={strategy.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{strategy.name}</CardTitle>
                <Badge variant="outline">{strategy.category}</Badge>
              </div>
              <CardDescription>{strategy.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">{strategy.description}</p>
              <Button asChild>
                <Link href={`/backtest?strategy=${strategy.id}`}>去回测</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
