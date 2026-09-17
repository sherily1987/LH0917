"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "盘面", icon: LayoutDashboard },
  { href: "/markets", label: "行情", icon: CandlestickChart },
  { href: "/strategies", label: "策略", icon: FlaskConical },
  { href: "/backtest", label: "回测", icon: Activity },
  { href: "/portfolio", label: "组合", icon: Wallet },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full bg-background">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            LH
          </span>
          <span>
            <span className="block text-sm font-medium">量衡</span>
            <span className="block font-mono text-[10px] tracking-wider text-muted-foreground">
              QUANT
            </span>
          </span>
        </Link>
        <NavLinks />
        <div className="mt-auto space-y-3 text-xs text-muted-foreground">
          <Separator />
          <p>研究终端 · 非投资建议</p>
          <p className="font-mono">v0.1 · 美股 / 中概 / 加密</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="打开导航">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="px-0">
                <SheetTitle>量衡 Quant</SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-medium">量衡 Quant</span>
        </header>
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
