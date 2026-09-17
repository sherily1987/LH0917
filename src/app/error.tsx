"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3 py-16">
      <h1 className="text-xl font-medium">页面出错了</h1>
      <p className="text-sm text-muted-foreground">行情源或回测引擎暂时不可用，请重试。</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        重试
      </button>
    </div>
  );
}
