import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, CATEGORY_LABELS } from "@/lib/format";
import { LogOut, Wallet, Store, ShoppingBasket, TrendingUp, TrendingDown, ArrowUp, ArrowDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
type Item = Database["public"]["Tables"]["receipt_items"]["Row"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Cuponizei" },
      { name: "description", content: "Veja seus gastos do mês e principais insights de consumo." },
    ],
  }),
  component: HomePage,
});

const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function HomePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("receipts").select("*").order("purchased_at", { ascending: false });
      const { data: i } = await supabase.from("receipt_items").select("*");
      setReceipts(r ?? []);
      setItems(i ?? []);
      setLoading(false);
    })();
  }, [user]);

  const insights = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const monthReceipts = receipts.filter((r) => new Date(r.purchased_at) >= startMonth);
    const prevMonthReceipts = receipts.filter((r) => {
      const d = new Date(r.purchased_at);
      return d >= startPrev && d <= endPrev;
    });

    const totalMonth = monthReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPrev = prevMonthReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
    const deltaPct = totalPrev > 0 ? ((totalMonth - totalPrev) / totalPrev) * 100 : null;

    const monthIds = new Set(monthReceipts.map((r) => r.id));
    const monthItems = items.filter((it) => monthIds.has(it.receipt_id));

    // top store
    const storeMap = new Map<string, number>();
    monthReceipts.forEach((r) => storeMap.set(r.store_name, (storeMap.get(r.store_name) ?? 0) + 1));
    const topStore = [...storeMap.entries()].sort((a, b) => b[1] - a[1])[0];

    // top product
    const productMap = new Map<string, number>();
    monthItems.forEach((it) => {
      const k = it.canonical_name || it.description;
      productMap.set(k, (productMap.get(k) ?? 0) + Number(it.quantity));
    });
    const topProduct = [...productMap.entries()].sort((a, b) => b[1] - a[1])[0];

    // most/least expensive item
    const sortedByPrice = [...monthItems].sort((a, b) => Number(b.unit_price) - Number(a.unit_price));
    const mostExpensive = sortedByPrice[0];
    const cheapest = sortedByPrice[sortedByPrice.length - 1];

    // by category
    const catMap = new Map<string, number>();
    monthItems.forEach((it) => catMap.set(it.category, (catMap.get(it.category) ?? 0) + Number(it.total_price)));
    const byCategory = [...catMap.entries()]
      .map(([k, v]) => ({ name: CATEGORY_LABELS[k] ?? k, value: Number(v.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    return { totalMonth, deltaPct, topStore, topProduct, mostExpensive, cheapest, byCategory, monthCount: monthReceipts.length };
  }, [receipts, items]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-8 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Olá!</p>
            <h1 className="mt-1 text-2xl font-bold">Seus gastos este mês</h1>
            <p className="mt-3 text-4xl font-bold tabular-nums">{formatBRL(insights.totalMonth)}</p>
            {insights.deltaPct !== null && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium">
                {insights.deltaPct >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {Math.abs(insights.deltaPct).toFixed(1)}% vs. mês anterior
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-primary-foreground hover:bg-primary-foreground/15">
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-4 py-5">
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : insights.monthCount === 0 ? (
          <Card className="p-8 text-center shadow-card">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
              <Wallet className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Sem cupons este mês</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tire a foto do seu primeiro cupom para começar a ver insights.
            </p>
            <Button onClick={() => navigate({ to: "/adicionar" })} className="mt-4 bg-gradient-primary">
              Adicionar cupom
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <InsightCard icon={Store} label="Loja favorita" value={insights.topStore?.[0] ?? "—"} sub={insights.topStore ? `${insights.topStore[1]} compras` : undefined} />
              <InsightCard icon={ShoppingBasket} label="Mais comprado" value={insights.topProduct?.[0] ?? "—"} sub={insights.topProduct ? `${insights.topProduct[1].toFixed(0)} un.` : undefined} />
              <InsightCard icon={TrendingUp} label="Mais caro" value={insights.mostExpensive?.canonical_name ?? insights.mostExpensive?.description ?? "—"} sub={insights.mostExpensive ? formatBRL(Number(insights.mostExpensive.unit_price)) : undefined} />
              <InsightCard icon={TrendingDown} label="Mais barato" value={insights.cheapest?.canonical_name ?? insights.cheapest?.description ?? "—"} sub={insights.cheapest ? formatBRL(Number(insights.cheapest.unit_price)) : undefined} />
            </div>

            {insights.byCategory.length > 0 && (
              <Card className="p-5 shadow-card">
                <h3 className="text-sm font-semibold">Gastos por categoria</h3>
                <div className="mt-2 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={insights.byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {insights.byCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {insights.byCategory.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-foreground">{c.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{formatBRL(c.value)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function InsightCard({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
