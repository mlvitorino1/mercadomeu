import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { ChevronLeft, ChevronRight, Receipt as ReceiptIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"];

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — Cuponizei" },
      { name: "description", content: "Veja seus cupons distribuídos ao longo do mês." },
    ],
  }),
  component: CalendarPage,
});

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString();
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .gte("purchased_at", start)
        .lt("purchased_at", end)
        .order("purchased_at", { ascending: false });
      setReceipts(data ?? []);
      setLoading(false);
    })();
  }, [user, cursor]);

  const { byDay, monthTotal } = useMemo(() => {
    const m = new Map<string, Receipt[]>();
    let total = 0;
    receipts.forEach((r) => {
      const d = new Date(r.purchased_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
      total += Number(r.total_amount);
    });
    return { byDay: m, monthTotal: total };
  }, [receipts]);

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: `${year}-${month}-${d}` });
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const selectedReceipts = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const selectedDate = selectedDay
    ? (() => {
        const [y, m, d] = selectedDay.split("-").map(Number);
        return new Date(y, m, d);
      })()
    : null;

  const goPrev = () => {
    setSelectedDay(null);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  };
  const goNext = () => {
    setSelectedDay(null);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-6 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <h1 className="text-2xl font-bold">Calendário</h1>
        <p className="mt-1 text-sm opacity-90">Suas compras dia a dia</p>
        <div className="mt-4 flex items-center justify-between">
          <Button size="icon" variant="ghost" onClick={goPrev} className="text-primary-foreground hover:bg-primary-foreground/15">
            <ChevronLeft className="size-5" />
          </Button>
          <div className="text-center">
            <p className="text-base font-semibold">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
            <p className="text-xs opacity-80 tabular-nums">{formatBRL(monthTotal)} · {receipts.length} cupons</p>
          </div>
          <Button size="icon" variant="ghost" onClick={goNext} className="text-primary-foreground hover:bg-primary-foreground/15">
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5">
        <Card className="p-3 shadow-card">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="py-1">{w}</div>
            ))}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-64 w-full" />
          ) : (
            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} className="aspect-square" />;
                const list = byDay.get(cell.key);
                const count = list?.length ?? 0;
                const isSelected = selectedDay === cell.key;
                const isToday = (() => {
                  const t = new Date();
                  return t.getFullYear() === cursor.getFullYear() && t.getMonth() === cursor.getMonth() && t.getDate() === cell.day;
                })();
                return (
                  <button
                    key={i}
                    onClick={() => count > 0 && setSelectedDay(isSelected ? null : cell.key)}
                    disabled={count === 0}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-all",
                      count > 0 ? "cursor-pointer hover:scale-105" : "cursor-default text-muted-foreground/60",
                      isSelected && "ring-2 ring-primary ring-offset-1",
                      isToday && !isSelected && "ring-1 ring-primary/40",
                      count === 0 && "bg-muted/30",
                    )}
                    style={count > 0 ? { backgroundColor: intensityColor(count) } : undefined}
                  >
                    <span className={cn("font-semibold", count > 0 && "text-primary-foreground")}>{cell.day}</span>
                    {count > 0 && (
                      <span className="text-[9px] font-medium leading-none text-primary-foreground/90">
                        {count >= 5 ? "5+" : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
            <span>Menos</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className="size-3 rounded-sm" style={{ backgroundColor: intensityColor(n) }} />
              ))}
            </div>
            <span>Mais</span>
          </div>
        </Card>

        {selectedDay && selectedDate && (
          <Card className="p-4 shadow-card">
            <h3 className="text-sm font-semibold">
              {selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedReceipts.length} {selectedReceipts.length === 1 ? "cupom" : "cupons"} ·{" "}
              {formatBRL(selectedReceipts.reduce((s, r) => s + Number(r.total_amount), 0))}
            </p>
            <div className="mt-3 space-y-2">
              {selectedReceipts.map((r) => (
                <Link key={r.id} to="/cupons/$id" params={{ id: r.id }}>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <div className="flex min-w-0 items-center gap-2">
                      <ReceiptIcon className="size-4 shrink-0 text-primary" />
                      <span className="truncate text-sm font-medium">{r.store_name}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatBRL(Number(r.total_amount))}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

// Intensity color baseada no token --primary, com transparência variando 30→100%
function intensityColor(count: number) {
  const opacity = Math.min(0.3 + count * 0.15, 1);
  return `color-mix(in oklab, var(--primary) ${Math.round(opacity * 100)}%, transparent)`;
}
