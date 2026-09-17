import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-4 py-24">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-medium">没有找到这个页面</h1>
      <Button asChild>
        <Link href="/">返回盘面</Link>
      </Button>
    </div>
  );
}
