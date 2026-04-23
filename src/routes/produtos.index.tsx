import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatBRL, CATEGORY_LABELS } from "@/lib/format";
import { Package, ChevronRight, TrendingUp, TrendingDown, Search, AlertTriangle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Item = Database["public"]["Tables"]["receipt_items"]["Row"] & {
  receipts: Pick<Database["public"]["Tables"]["receipts"]["Row"], "purchased_at" | "store_name"> | null;
};

type Aggregated = {
  key: string;
  name: string;
  category: string;
  purchases: number;
  totalQty: number;
  lastPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  lastDate: string;
  trendPct: number | null;
};

export const Route = createFileRoute("/produtos/")({
  head: () => ({
    meta: [
      { title: "Produtos — Cuponizei" },
      { name: "description", content: "Histórico de preços e variações dos produtos que você compra." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("receipt_items")
        .select("*, receipts(purchased_at, store_name)")
        .order("created_at", { ascending: false });
      setItems((data ?? []) as Item[]);
      setLoading(false);
    })();
  }, [user]);

  const products = useMemo<Aggregated[]>(() => {
    const map = new Map<string, Item[]>();
    items.forEach((it) => {
      const k = (it.canonical_name || it.description).trim().toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });

    return [...map.entries()]
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => {
          const da = a.receipts?.purchased_at ?? a.created_at;
          const db = b.receipts?.purchased_at ?? b.created_at;
          return new Date(db).getTime() - new Date(da).getTime();
        });
        const prices = sorted.map((i) => Number(i.unit_price)).filter((p) => p > 0);
        const last = sorted[0];
        const avg = prices.reduce((s, p) => s + p, 0) / (prices.length || 1);
        const lastPrice = Number(last.unit_price);
        const previous = sorted[1] ? Number(sorted[1].unit_price) : null;
        const trendPct = previous && previous > 0 ? ((lastPrice - previous) / previous) * 100 : null;
        return {
          key,
          name: last.canonical_name || last.description,
          category: last.category,
          purchases: sorted.length,
          totalQty: sorted.reduce((s, i) => s + Number(i.quantity), 0),
          lastPrice,
          avgPrice: avg,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          lastDate: last.receipts?.purchased_at ?? last.created_at,
          trendPct,
        };
      })
      .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.purchases - a.purchases);
  }, [items, q]);

  const alerts = products.filter((p) => p.trendPct !== null && p.trendPct >= 10);

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
        <h1 className="text-2xl font-bold">Produtos</h1>
        <p className="mt-1 text-sm opacity-90">{products.length} {products.length === 1 ? "produto" : "produtos"} no histórico</p>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto…"
            className="border-0 bg-primary-foreground/95 pl-9 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </header>

      <div className="space-y-3 px-4 py-5">
        {loading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : products.length === 0 ? (
          <Card className="p-8 text-center shadow-card">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
              <Package className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Sem produtos ainda</h2>
            <p className="mt-1 text-sm text-muted-foreground">Adicione cupons para ver seu histórico de preços.</p>
          </Card>
        ) : (
          <>
            {alerts.length > 0 && (
              <Card className="border-warning/40 bg-warning/10 p-4 shadow-card">
                <div className="flex items-center gap-2 text-warning-foreground">
                  <AlertTriangle className="size-4 text-warning" />
                  <h3 className="text-sm font-semibold">
                    {alerts.length} {alerts.length === 1 ? "produto subiu" : "produtos subiram"} de preço
                  </h3>
                </div>
                <div className="mt-2 space-y-1">
                  {alerts.slice(0, 3).map((a) => (
                    <Link key={a.key} to="/produtos/$id" params={{ id: encodeURIComponent(a.key) }} className="flex items-center justify-between text-xs">
                      <span className="truncate">{a.name}</span>
                      <span className="font-semibold text-destructive">+{a.trendPct!.toFixed(0)}%</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {products.map((p) => (
              <Link key={p.key} to="/produtos/$id" params={{ id: encodeURIComponent(p.key) }}>
                <Card className="flex items-center justify-between gap-3 p-4 shadow-card transition-transform active:scale-[0.99] hover:shadow-elevated">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{CATEGORY_LABELS[p.category] ?? p.category}</Badge>
                      <span className="text-[11px] text-muted-foreground">{p.purchases}× comprado</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">{formatBRL(p.lastPrice)}</p>
                    {p.trendPct !== null && Math.abs(p.trendPct) >= 1 && (
                      <p className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium ${p.trendPct >= 0 ? "text-destructive" : "text-success"}`}>
                        {p.trendPct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                        {Math.abs(p.trendPct).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            ))}
          </>
        )}
      </div>
    </AppLayout>
  );
}
