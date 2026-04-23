import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, CATEGORY_LABELS } from "@/lib/format";
import { ArrowLeft, TrendingUp, TrendingDown, Award, AlertTriangle, Store } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Item = Database["public"]["Tables"]["receipt_items"]["Row"] & {
  receipts: Pick<Database["public"]["Tables"]["receipts"]["Row"], "purchased_at" | "store_name"> | null;
};

export const Route = createFileRoute("/produtos/$id")({
  head: () => ({
    meta: [
      { title: "Histórico do produto — Cuponizei" },
      { name: "description", content: "Evolução de preços e comparativo entre mercados." },
    ],
  }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const productKey = decodeURIComponent(id);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

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
        .order("created_at", { ascending: true });
      const filtered = ((data ?? []) as Item[]).filter(
        (i) => (i.canonical_name || i.description).trim().toLowerCase() === productKey,
      );
      setItems(filtered);
      setLoading(false);
    })();
  }, [user, productKey]);

  const data = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const da = a.receipts?.purchased_at ?? a.created_at;
      const db = b.receipts?.purchased_at ?? b.created_at;
      return new Date(da).getTime() - new Date(db).getTime();
    });

    const series = sorted.map((i) => ({
      date: i.receipts?.purchased_at ?? i.created_at,
      label: formatDate(i.receipts?.purchased_at ?? i.created_at),
      price: Number(i.unit_price),
      store: i.receipts?.store_name ?? "—",
    }));

    const prices = series.map((s) => s.price).filter((p) => p > 0);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const last = series[series.length - 1];
    const previous = series[series.length - 2];
    const trendPct = previous && previous.price > 0 ? ((last.price - previous.price) / previous.price) * 100 : null;

    // Por mercado
    const storeMap = new Map<string, number[]>();
    sorted.forEach((i) => {
      const s = i.receipts?.store_name ?? "—";
      if (!storeMap.has(s)) storeMap.set(s, []);
      storeMap.get(s)!.push(Number(i.unit_price));
    });
    const byStore = [...storeMap.entries()]
      .map(([store, ps]) => ({
        store,
        avg: ps.reduce((a, b) => a + b, 0) / ps.length,
        min: Math.min(...ps),
        max: Math.max(...ps),
        count: ps.length,
      }))
      .sort((a, b) => a.avg - b.avg);

    const cheapestStore = byStore[0];
    const savingsVsAvg = cheapestStore ? avg - cheapestStore.avg : 0;

    return {
      series,
      min,
      max,
      avg,
      last,
      trendPct,
      byStore,
      cheapestStore,
      savingsVsAvg,
      name: sorted[0]?.canonical_name || sorted[0]?.description || productKey,
      category: sorted[0]?.category ?? "outros",
    };
  }, [items, productKey]);

  if (authLoading || !user || loading) {
    return (
      <AppLayout>
        <div className="space-y-3 p-5">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (items.length === 0) {
    return (
      <AppLayout>
        <div className="p-5">
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Produto não encontrado.</p>
            <Link to="/produtos" className="mt-4 inline-block text-sm font-semibold text-primary">Voltar</Link>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const priceUp = data.trendPct !== null && data.trendPct >= 10;

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-6 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <Link to="/produtos" className="inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowLeft className="size-4" /> Produtos
        </Link>
        <h1 className="mt-2 text-xl font-bold leading-tight">{data.name}</h1>
        <Badge variant="secondary" className="mt-2 h-5 px-2 text-[10px]">
          {CATEGORY_LABELS[data.category] ?? data.category}
        </Badge>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs opacity-80">Último preço</p>
            <p className="text-3xl font-bold tabular-nums">{formatBRL(data.last.price)}</p>
            <p className="text-xs opacity-80">em {data.last.store}</p>
          </div>
          {data.trendPct !== null && (
            <div className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1">
              {data.trendPct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(data.trendPct).toFixed(1)}%
            </div>
          )}
        </div>
      </header>

      <div className="space-y-3 px-4 py-5">
        {priceUp && (
          <Card className="border-warning/40 bg-warning/10 p-4 shadow-card">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Alerta de aumento</p>
                <p className="mt-1 text-muted-foreground">
                  Subiu {data.trendPct!.toFixed(1)}% desde a última compra. Considere comprar em outro mercado.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Mínimo" value={formatBRL(data.min)} accent="success" />
          <StatCard label="Médio" value={formatBRL(data.avg)} />
          <StatCard label="Máximo" value={formatBRL(data.max)} accent="destructive" />
        </div>

        {data.series.length > 1 && (
          <Card className="p-4 shadow-card">
            <h3 className="text-sm font-semibold">Evolução de preço</h3>
            <p className="text-xs text-muted-foreground">{data.series.length} compras registradas</p>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { label: string; store: string } | undefined;
                      return p ? `${p.label} · ${p.store}` : "";
                    }}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="price" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {data.byStore.length > 1 && (
          <Card className="p-4 shadow-card">
            <h3 className="text-sm font-semibold">Comparativo entre mercados</h3>
            {data.cheapestStore && data.savingsVsAvg > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-xs">
                <Award className="size-4 shrink-0 text-success" />
                <span>
                  <strong>{data.cheapestStore.store}</strong> é o mais barato — economiza {formatBRL(data.savingsVsAvg)} por unidade vs. média.
                </span>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {data.byStore.map((s, i) => (
                <div key={s.store} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Store className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.store}</p>
                      <p className="text-[10px] text-muted-foreground">{s.count}× · min {formatBRL(s.min)} · máx {formatBRL(s.max)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{formatBRL(s.avg)}</p>
                    {i === 0 && <p className="text-[10px] font-semibold text-success">melhor preço</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4 shadow-card">
          <h3 className="text-sm font-semibold">Histórico de compras</h3>
          <div className="mt-2 space-y-1.5">
            {[...data.series].reverse().map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
                <div>
                  <p className="font-medium">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground">{s.store}</p>
                </div>
                <span className="font-semibold tabular-nums">{formatBRL(s.price)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "success" | "destructive" }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-3 text-center shadow-card">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${color}`}>{value}</p>
    </Card>
  );
}
