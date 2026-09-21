import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const DESK_NOTE_EXAMPLES = [
  "今天只做小仓，别追高",
  "按趋势跟随，可以持有数周",
  "波动太大，先观望",
] as const;

export function DeskNoteForm({
  defaultNote = "",
}: {
  defaultNote?: string;
}) {
  return (
    <form action="/research" method="get" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="search"
          name="note"
          defaultValue={defaultNote}
          placeholder="可选：给 Jev 的约束，例如今天只做小仓"
          aria-label="交易约束"
          maxLength={400}
          className="flex-1"
        />
        <Button type="submit">重新判断</Button>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {DESK_NOTE_EXAMPLES.map((example) => (
          <Link
            key={example}
            href={`/research?note=${encodeURIComponent(example)}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {example}
          </Link>
        ))}
      </p>
    </form>
  );
}
