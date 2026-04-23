import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL, CATEGORY_LABELS } from "@/lib/format";
import { computeAchievements, type Achievement } from "@/lib/achievements";
import {
  LogOut, Wallet, Store, ShoppingBasket, TrendingUp, TrendingDown, ArrowUp, ArrowDown,
  Sparkles, AlertTriangle, Trophy, Lightbulb, Target, Repeat, PiggyBank, Package, CalendarDays,
  Plus, Award, Compass, Flame, PackageOpen, ChevronRight, RefreshCw,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { hashInputs, readCache, writeCache, clearCache, formatRelativeTime } from "@/lib/insights-cache";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
type Item = Database["public"]["Tables"]["receipt_items"]["Row"];
type Household = Database["public"]["Tables"]["household_profile"]["Row"];

type Tip = { title: string; body: string; icon: "swap" | "alert" | "save" | "bulk" | "schedule" };
type StockAlert = { product: string; days_left_estimate: number; reason: string };
type Forecast = {
  forecast_month_total: number;
  forecast_confidence: "baixa" | "média" | "alta";
  forecast_explanation: string;
  tips: Tip[];
  stock_alerts: StockAlert[];
};

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — CuponizAI" },
      { name: "description", content: "Resumo financeiro, previsão IA, dicas de economia e conquistas." },
    ],
  }),
  component: HomePage,
});

const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

const TIP_ICONS = { swap: Repeat, alert: AlertTriangle, save: PiggyBank, bulk: ShoppingBasket, schedule: CalendarDays };
const ACH_ICONS = { first: Sparkles, ten: Trophy, fifty: Award, saver: PiggyBank, explorer: Compass, streak: Flame };

function HomePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastGeneratedAt, setForecastGeneratedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<"month" | "all">("month");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [r, i, h] = await Promise.all([
        supabase.from("receipts").select("*").order("purchased_at", { ascending: false }),
        supabase.from("receipt_items").select("*"),
        supabase.from("household_profile").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      setReceipts(r.data ?? []);
      setItems(i.data ?? []);
      setHousehold(h.data ?? null);
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

    // Escopo selecionado: mês atual OU todos os tempos
    const scopeReceipts = scope === "month" ? monthReceipts : receipts;
    const scopeIds = new Set(scopeReceipts.map((r) => r.id));
    const scopeItems = items.filter((it) => scopeIds.has(it.receipt_id));

    const totalScope = scopeReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalMonth = monthReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPrev = prevMonthReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
    const deltaPct = totalPrev > 0 ? ((totalMonth - totalPrev) / totalPrev) * 100 : null;

    const storeMap = new Map<string, number>();
    scopeReceipts.forEach((r) => storeMap.set(r.store_name, (storeMap.get(r.store_name) ?? 0) + 1));
    const topStore = [...storeMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const productMap = new Map<string, number>();
    scopeItems.forEach((it) => {
      const k = it.canonical_name || it.description;
      productMap.set(k, (productMap.get(k) ?? 0) + Number(it.quantity));
    });
    const topProduct = [...productMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const sortedByPrice = [...scopeItems].sort((a, b) => Number(b.unit_price) - Number(a.unit_price));
    const mostExpensive = sortedByPrice[0];
    const cheapest = sortedByPrice[sortedByPrice.length - 1];

    const catMap = new Map<string, number>();
    scopeItems.forEach((it) => catMap.set(it.category, (catMap.get(it.category) ?? 0) + Number(it.total_price)));
    const byCategory = [...catMap.entries()]
      .map(([k, v]) => ({ name: CATEGORY_LABELS[k] ?? k, value: Number(v.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    // Alertas de aumento: sempre considerando todos os itens (independente do escopo)
    const productHistory = new Map<string, { price: number; date: string }[]>();
    items.forEach((it) => {
      const k = (it.canonical_name || it.description).toLowerCase();
      if (!productHistory.has(k)) productHistory.set(k, []);
      productHistory.get(k)!.push({ price: Number(it.unit_price), date: it.created_at });
    });
    const alerts: { name: string; pct: number }[] = [];
    items.forEach((it) => {
      const k = (it.canonical_name || it.description).toLowerCase();
      const list = productHistory.get(k);
      if (!list || list.length < 2) return;
      const sorted = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const pct = sorted[1].price > 0 ? ((sorted[0].price - sorted[1].price) / sorted[1].price) * 100 : 0;
      if (pct >= 10 && !alerts.find((a) => a.name === (it.canonical_name || it.description))) {
        alerts.push({ name: it.canonical_name || it.description, pct });
      }
    });

    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pace = dayOfMonth > 0 ? (totalMonth / dayOfMonth) * daysInMonth : 0;

    const latestReceiptDate = receipts[0] ? new Date(receipts[0].purchased_at) : null;
    const totalAllTime = receipts.reduce((s, r) => s + Number(r.total_amount), 0);

    return {
      totalScope, totalMonth, totalPrev, totalAllTime, deltaPct, topStore, topProduct, mostExpensive, cheapest,
      byCategory, monthCount: monthReceipts.length, scopeCount: scopeReceipts.length,
      alerts, pace, dayOfMonth, daysInMonth, latestReceiptDate,
    };
  }, [receipts, items, scope]);

  const achievements = useMemo<Achievement[]>(() => {
    const uniqueStores = new Set(receipts.map((r) => r.store_name)).size;
    return computeAchievements({
      totalReceipts: receipts.length,
      uniqueStores,
      monthSpend: insights.totalMonth,
      prevMonthSpend: insights.totalPrev,
      cheapestSwitches: 0, // placeholder — métrica só faz sentido com mais histórico
    });
  }, [receipts, insights]);

  // Insights IA com cache determinístico em ai_insights
  const loadOrGenerateForecast = useMemo(
    () => async (force = false) => {
      if (!user || receipts.length < 2) return;

      // Top produtos arredondados para hash estável (mesmos dados → mesmo hash)
      const topProducts = [...items.reduce((m, it) => {
        const k = (it.canonical_name || it.description).toLowerCase();
        m.set(k, (m.get(k) ?? 0) + Number(it.quantity));
        return m;
      }, new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, qty]) => ({ name, qty: Math.round(qty) }));

      const hashInput = {
        totalMonth: Math.round(insights.totalMonth / 5) * 5,
        totalPrev: Math.round(insights.totalPrev / 5) * 5,
        monthCount: insights.monthCount,
        dayOfMonth: insights.dayOfMonth,
        topProducts,
        household: household
          ? {
              adults: household.adults,
              children: household.children,
              pets: household.pets,
              income: household.income_range,
              budget: household.monthly_grocery_budget,
              restrictions: [...(household.restrictions ?? [])].sort(),
              stores: [...(household.favorite_stores ?? [])].sort(),
              freq: household.shopping_frequency,
              pay: household.preferred_payment_method,
            }
          : null,
      };

      const inputHash = await hashInputs(hashInput);

      if (!force) {
        const cached = await readCache<Forecast>(user.id, "forecast", inputHash);
        if (cached) {
          setForecast(cached.payload);
          setForecastGeneratedAt(cached.generatedAt);
          return;
        }
      } else {
        await clearCache(user.id, "forecast");
      }

      setForecastLoading(true);
      const summary = {
        mes_atual: {
          gasto_atual: insights.totalMonth,
          dia_do_mes: insights.dayOfMonth,
          dias_no_mes: insights.daysInMonth,
          cupons: insights.monthCount,
          ritmo_estimado: insights.pace,
        },
        mes_anterior: { gasto_total: insights.totalPrev },
        top_produtos: insights.topProduct ? [{ nome: insights.topProduct[0], quantidade: insights.topProduct[1] }] : [],
        top_lojas: insights.topStore ? [{ nome: insights.topStore[0], visitas: insights.topStore[1] }] : [],
        gastos_por_categoria: insights.byCategory,
        alertas_aumento: insights.alerts.slice(0, 5),
        compras_recentes: items
          .slice()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 30)
          .map((it) => ({
            produto: it.canonical_name || it.description,
            categoria: it.category,
            quantidade: Number(it.quantity),
            comprado_em: it.created_at,
          })),
      };

      const householdPayload = household
        ? {
            adultos: household.adults,
            criancas: household.children,
            pets: household.pets,
            renda_faixa: household.income_range,
            orcamento_mercado: household.monthly_grocery_budget,
            restricoes: household.restrictions,
            mercados_favoritos: household.favorite_stores,
            frequencia_compras: household.shopping_frequency,
            pagamento_preferido: household.preferred_payment_method,
          }
        : null;

      const { data, error } = await supabase.functions.invoke("insights-ai", {
        body: { summary, household: householdPayload },
      });
      if (error) {
        if (error.message?.includes("429")) toast.error("Muitas requisições. Aguarde alguns segundos.");
        else if (error.message?.includes("402")) toast.error("Sem créditos na Lovable AI.");
      } else if (data && !data.error) {
        const payload = data as Forecast;
        setForecast(payload);
        const now = new Date().toISOString();
        setForecastGeneratedAt(now);
        await writeCache<Forecast>(user.id, "forecast", inputHash, payload);
      }
      setForecastLoading(false);
    },
    [user, receipts.length, insights, household, items],
  );

  useEffect(() => {
    if (loading || forecast || forecastLoading) return;
    void loadOrGenerateForecast(false);
  }, [loading, forecast, forecastLoading, loadOrGenerateForecast]);

  async function handleRefreshForecast() {
    setForecast(null);
    setForecastGeneratedAt(null);
    await loadOrGenerateForecast(true);
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  const forecastTotal = forecast?.forecast_month_total ?? insights.pace;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const heroTitle = scope === "month" ? "Seus gastos este mês" : "Total acumulado";
  const heroValue = scope === "month" ? insights.totalMonth : insights.totalAllTime;
  const heroCount = scope === "month" ? insights.monthCount : receipts.length;
  const showOnboardingBanner = !loading && !!user && !household?.onboarding_completed_at && receipts.length > 0;
  const noReceiptsAtAll = !loading && receipts.length === 0;
  const onlyOldReceipts = !loading && receipts.length > 0 && insights.monthCount === 0;

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-8 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider opacity-80">Olá!</p>
            <h1 className="mt-1 text-2xl font-bold">{heroTitle}</h1>
            <p className="mt-3 text-4xl font-bold tabular-nums">{formatBRL(heroValue)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {scope === "month" && insights.deltaPct !== null && (
                <div className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium">
                  {insights.deltaPct >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(insights.deltaPct).toFixed(1)}% vs. mês anterior
                </div>
              )}
              {scope === "all" && (
                <div className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium">
                  {receipts.length} {receipts.length === 1 ? "cupom" : "cupons"}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-primary-foreground hover:bg-primary-foreground/15">
            <LogOut className="size-5" />
          </Button>
        </div>

        {/* Toggle escopo */}
        {receipts.length > 0 && (
          <div className="mt-5 inline-flex rounded-full bg-primary-foreground/15 p-1 text-xs font-semibold">
            <button
              onClick={() => setScope("month")}
              className={`rounded-full px-4 py-1.5 transition-all ${scope === "month" ? "bg-primary-foreground text-primary shadow" : "text-primary-foreground/80"}`}
            >
              Este mês
            </button>
            <button
              onClick={() => setScope("all")}
              className={`rounded-full px-4 py-1.5 transition-all ${scope === "all" ? "bg-primary-foreground text-primary shadow" : "text-primary-foreground/80"}`}
            >
              Todos os tempos
            </button>
          </div>
        )}
      </header>

      <div className="space-y-3 px-4 py-5">
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : noReceiptsAtAll ? (
          <Card className="p-8 text-center shadow-card">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
              <Wallet className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Tudo pronto para começar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tire a foto do seu primeiro cupom para começar a ver insights.
            </p>
            <Button onClick={() => navigate({ to: "/adicionar" })} className="mt-4 bg-gradient-primary">
              <Plus className="mr-1 size-4" /> Adicionar cupom
            </Button>
          </Card>
        ) : (
          <>
            {/* Banner: convidar a completar onboarding */}
            {showOnboardingBanner && (
              <button
                onClick={() => navigate({ to: "/onboarding" })}
                className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/30 p-4 text-left shadow-card transition-all hover:shadow-elevated"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Personalize seus insights</p>
                  <p className="text-xs text-muted-foreground">Conte sobre sua casa em 1 minuto.</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}

            {/* Aviso: sem cupons este mês mas existem antigos */}
            {onlyOldReceipts && scope === "month" && (
              <Card className="border-dashed border-primary/40 bg-primary/5 p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <CalendarDays className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Sem cupons este mês</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Você tem {receipts.length} {receipts.length === 1 ? "cupom" : "cupons"} em outros períodos.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setScope("all")} className="h-8 text-xs">
                        Ver todos
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate({ to: "/calendario" })} className="h-8 text-xs">
                        Abrir calendário
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Hero Promoções inteligentes */}
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-promo p-4 text-primary-foreground shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-white/20 text-2xl backdrop-blur">
                  🏷️
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Promoções inteligentes</p>
                  <p className="text-xs opacity-90">Cadastre o panfleto do seu mercado e a IA extrai as ofertas</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link to="/promocoes/cadastrar" className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full gap-1.5">
                    <Plus className="size-3.5" /> Cadastrar panfleto
                  </Button>
                </Link>
                <Link to="/promocoes" className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full gap-1.5">
                    Ver ofertas <ChevronRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Atalhos rápidos */}
            <div className="grid grid-cols-3 gap-2">
              <ShortcutCard to="/calendario" icon={CalendarDays} label="Calendário" />
              <ShortcutCard to="/produtos" icon={Package} label="Produtos" />
              <ShortcutCard to="/cupons" icon={ShoppingBasket} label="Cupons" />
            </div>

            {/* Previsão IA — Fase 4 */}
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-accent/30 p-5 shadow-card">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Previsão para o mês</h3>
                {forecastLoading && <Skeleton className="ml-auto h-4 w-16" />}
                {!forecastLoading && forecast && (
                  <button
                    onClick={handleRefreshForecast}
                    aria-label="Atualizar análise"
                    className="ml-auto flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                {formatBRL(forecastTotal)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {forecast?.forecast_explanation ??
                  `Baseado no ritmo dos últimos ${insights.dayOfMonth} dias. ${forecast ? "" : "Aguardando análise da IA…"}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {forecast && (
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                    Confiança {forecast.forecast_confidence}
                  </Badge>
                )}
                {forecastGeneratedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Atualizado {formatRelativeTime(forecastGeneratedAt)}
                  </span>
                )}
              </div>
              {insights.totalPrev > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Meta sugerida (-10%)</span>
                  <span className="font-bold tabular-nums text-success">{formatBRL(insights.totalPrev * 0.9)}</span>
                </div>
              )}
            </Card>

            {/* Sugestões IA — Fase 4 */}
            {forecast && forecast.tips.length > 0 && (
              <Card className="p-5 shadow-card">
                <div className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-warning" />
                  <h3 className="text-sm font-semibold">Dicas para você economizar</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {forecast.tips.map((tip, i) => {
                    const Icon = TIP_ICONS[tip.icon] ?? Lightbulb;
                    return (
                      <div key={i} className="flex gap-3 rounded-xl bg-muted/40 p-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">{tip.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{tip.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Alertas de estoque IA — Fase 4+ */}
            {forecast && forecast.stock_alerts && forecast.stock_alerts.length > 0 && (
              <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5 p-5 shadow-card">
                <button
                  onClick={() => navigate({ to: "/estoque", search: { product: undefined } })}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <PackageOpen className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Provável baixa de estoque</h3>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Estimativa baseada em {household ? `sua casa (${household.adults + household.children} pessoas)` : "seu padrão de consumo"}.
                </p>
                <div className="mt-3 space-y-2">
                  {forecast.stock_alerts.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => navigate({ to: "/estoque", search: { product: s.product } })}
                      className="flex w-full items-center gap-3 rounded-xl bg-muted/40 p-3 text-left transition-colors hover:bg-muted/70"
                    >
                      <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="text-sm font-bold leading-none tabular-nums">{Math.max(0, Math.round(s.days_left_estimate))}</span>
                        <span className="text-[8px] font-medium uppercase leading-none">dias</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold">{s.product}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground leading-snug">{s.reason}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => navigate({ to: "/lista" })}
                  className="mt-4 w-full bg-gradient-primary"
                  size="sm"
                >
                  <ShoppingBasket className="size-4" /> Gerar lista de compras
                </Button>
              </Card>
            )}

            {/* Botão CTA de lista (sem alertas) */}
            {forecast && (!forecast.stock_alerts || forecast.stock_alerts.length === 0) && receipts.length > 0 && (
              <Card className="border-primary/20 bg-gradient-to-br from-card to-accent/30 p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                    <ShoppingBasket className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Gerar lista de compras</p>
                    <p className="text-xs text-muted-foreground">A IA monta com base nos seus hábitos.</p>
                  </div>
                  <Button onClick={() => navigate({ to: "/lista" })} size="sm" variant="secondary" className="shrink-0">
                    Abrir
                  </Button>
                </div>
              </Card>
            )}

            {insights.alerts.length > 0 && (
              <Card className="border-warning/40 bg-warning/10 p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  <h3 className="text-sm font-semibold">
                    {insights.alerts.length} {insights.alerts.length === 1 ? "produto subiu" : "produtos subiram"} de preço
                  </h3>
                </div>
                <div className="mt-2 space-y-1">
                  {insights.alerts.slice(0, 3).map((a, i) => (
                    <Link key={i} to="/produtos" className="flex items-center justify-between text-xs">
                      <span className="truncate">{a.name}</span>
                      <span className="font-semibold text-destructive">+{a.pct.toFixed(0)}%</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Insight cards */}
            <div className="grid grid-cols-2 gap-3">
              <InsightCard icon={Store} label="Loja favorita" value={insights.topStore?.[0] ?? "—"} sub={insights.topStore ? `${insights.topStore[1]} compras` : undefined} />
              <InsightCard icon={ShoppingBasket} label="Mais comprado" value={insights.topProduct?.[0] ?? "—"} sub={insights.topProduct ? `${insights.topProduct[1].toFixed(0)} un.` : undefined} />
              <InsightCard icon={TrendingUp} label="Mais caro" value={insights.mostExpensive?.canonical_name ?? insights.mostExpensive?.description ?? "—"} sub={insights.mostExpensive ? formatBRL(Number(insights.mostExpensive.unit_price)) : undefined} />
              <InsightCard icon={TrendingDown} label="Mais barato" value={insights.cheapest?.canonical_name ?? insights.cheapest?.description ?? "—"} sub={insights.cheapest ? formatBRL(Number(insights.cheapest.unit_price)) : undefined} />
            </div>

            {/* Categorias */}
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

            {/* Conquistas — Fase 4 */}
            <Card className="p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Conquistas</h3>
                </div>
                <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                  {unlockedCount}/{achievements.length}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {achievements.map((a) => {
                  const Icon = ACH_ICONS[a.icon];
                  return (
                    <div
                      key={a.id}
                      className={`flex flex-col items-center gap-1 rounded-xl p-2.5 text-center transition-all ${
                        a.unlocked ? "bg-gradient-primary text-primary-foreground shadow-card" : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Icon className={`size-5 ${a.unlocked ? "" : "opacity-50"}`} />
                      <p className="text-[10px] font-bold leading-tight">{a.title}</p>
                      {a.progress && !a.unlocked && (
                        <p className="text-[9px] tabular-nums opacity-80">
                          {a.progress.current}/{a.progress.total}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <p className="pt-2 text-center text-[10px] text-muted-foreground">
              <Target className="mr-1 inline size-3" /> Continue adicionando cupons para insights mais precisos
            </p>
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

function ShortcutCard({ to, icon: Icon, label }: { to: string; icon: typeof Wallet; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 text-xs font-semibold text-foreground shadow-card transition-transform active:scale-95 hover:shadow-elevated"
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      {label}
    </Link>
  );
}
