import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const RESEARCH_EXAMPLES = [
  "回测苹果两年双均线",
  "看看英伟达的行情",
  "打开模拟组合",
] as const;

export function ResearchForm({
  defaultQuery = "",
  autoFocus = false,
}: {
  defaultQuery?: string;
  autoFocus?: boolean;
}) {
  return (
    <form action="/research" method="get" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder="用一句话说，例如：回测苹果两年双均线"
          aria-label="研究意图"
          autoFocus={autoFocus}
          maxLength={500}
          className="flex-1"
        />
        <Button type="submit">解析</Button>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {RESEARCH_EXAMPLES.map((example) => (
          <Link
            key={example}
            href={`/research?q=${encodeURIComponent(example)}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {example}
          </Link>
        ))}
      </p>
    </form>
  );
}
