import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PackageOpen, Users, Baby, Dog, Save, ShoppingBasket, Sparkles } from "lucide-react";
import { formatBRL, formatDate, CATEGORY_LABELS } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
type Item = Database["public"]["Tables"]["receipt_items"]["Row"];
type Household = Database["public"]["Tables"]["household_profile"]["Row"];

type StockAlert = {
  product: string;
  category: string;
  days_left_estimate: number;
  reason: string;
};

export const Route = createFileRoute("/estoque")({
  validateSearch: (s: Record<string, unknown>) => ({
    product: typeof s.product === "string" ? s.product : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Provável baixa de estoque — Cuponizei" },
      { name: "description", content: "Veja as compras que originaram a previsão e ajuste sua casa." },
    ],
  }),
  component: EstoquePage,
});

function EstoquePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const focusProduct = search.product?.toLowerCase();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Edição local da família
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [pets, setPets] = useState(0);
  const [savingHousehold, setSavingHousehold] = useState(false);

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
      if (h.data) {
        setAdults(h.data.adults);
        setChildren(h.data.children);
        setPets(h.data.pets);
      }
      setLoading(false);
    })();
  }, [user]);

  // Recupera previsão IA
  async function generate() {
    if (!user || generating) return;
    setGenerating(true);
    const summary = {
      compras_recentes: items
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 60)
        .map((it) => ({
          produto: it.canonical_name || it.description,
          categoria: it.category,
          quantidade: Number(it.quantity),
          comprado_em: it.created_at,
        })),
      mes_atual: { gasto_atual: 0, dia_do_mes: new Date().getDate(), dias_no_mes: 30, cupons: receipts.length, ritmo_estimado: 0 },
      mes_anterior: { gasto_total: 0 },
      top_produtos: [],
      top_lojas: [],
      gastos_por_categoria: [],
      alertas_aumento: [],
    };
    const householdPayload = {
      adultos: adults,
      criancas: children,
      pets,
      renda_faixa: household?.income_range,
      orcamento_mercado: household?.monthly_grocery_budget,
      restricoes: household?.restrictions ?? [],
      mercados_favoritos: household?.favorite_stores ?? [],
      frequencia_compras: household?.shopping_frequency,
      pagamento_preferido: household?.preferred_payment_method,
    };
    const { data, error } = await supabase.functions.invoke("insights-ai", {
      body: { summary, household: householdPayload },
    });
    if (error || data?.error) {
      toast.error("Não consegui gerar agora.");
    } else {
      setAlerts(data.stock_alerts ?? []);
    }
    setGenerating(false);
  }

  useEffect(() => {
    if (!loading && items.length > 0 && alerts.length === 0) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length]);

  async function saveHousehold() {
    if (!user) return;
    setSavingHousehold(true);
    const payload = {
      user_id: user.id,
      adults,
      children,
      pets,
      onboarding_completed_at: household?.onboarding_completed_at ?? new Date().toISOString(),
    };
    const { error } = await supabase
      .from("household_profile")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast.error("Não consegui salvar.");
    } else {
      toast.success("Casa atualizada. Recalculando…");
      setHousehold((h) => (h ? { ...h, adults, children, pets } : h));
      setAlerts([]);
      await generate();
    }
    setSavingHousehold(false);
  }

  // Mapa de compras por produto (case-insensitive)
  const purchasesByProduct = useMemo(() => {
    const map = new Map<string, { item: Item; receipt?: Receipt }[]>();
    items.forEach((it) => {
      const key = (it.canonical_name || it.description).toLowerCase();
      const list = map.get(key) ?? [];
      const receipt = receipts.find((r) => r.id === it.receipt_id);
      list.push({ item: it, receipt });
      map.set(key, list);
    });
    return map;
  }, [items, receipts]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  const dirty = household
    ? household.adults !== adults || household.children !== children || household.pets !== pets
    : adults !== 1 || children !== 0 || pets !== 0;

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-7 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <button
          onClick={() => navigate({ to: "/home" })}
          className="inline-flex items-center gap-1 text-xs font-medium opacity-90"
        >
          <ArrowLeft className="size-3.5" /> Voltar
        </button>
        <div className="mt-3 flex items-center gap-2">
          <PackageOpen className="size-5" />
          <h1 className="text-xl font-bold">Provável baixa de estoque</h1>
        </div>
        <p className="mt-1 text-xs opacity-90">
          Estimativas baseadas nas suas compras e tamanho da casa.
        </p>
      </header>

      <div className="space-y-3 px-4 py-5">
        {/* Ajuste manual da família */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sua casa</h3>
            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
              Recalcula a previsão
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            <Counter icon={Users} label="Adultos" value={adults} onChange={setAdults} min={1} max={15} />
            <Counter icon={Baby} label="Crianças" value={children} onChange={setChildren} min={0} max={15} />
            <Counter icon={Dog} label="Pets" value={pets} onChange={setPets} min={0} max={15} />
          </div>
          {dirty && (
            <Button
              onClick={saveHousehold}
              disabled={savingHousehold}
              className="mt-4 w-full bg-gradient-primary"
            >
              <Save className="size-4" />
              {savingHousehold ? "Salvando…" : "Salvar e recalcular"}
            </Button>
          )}
        </Card>

        {/* Atalho para gerar lista */}
        <Link
          to="/lista"
          className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/30 p-4 text-left shadow-card transition-all hover:shadow-elevated"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
            <ShoppingBasket className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Gerar lista de compras</p>
            <p className="text-xs text-muted-foreground">Inclui itens em baixa + sugestões IA.</p>
          </div>
          <Sparkles className="size-4 shrink-0 text-primary" />
        </Link>

        {loading || generating ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : alerts.length === 0 ? (
          <Card className="p-8 text-center shadow-card">
            <PackageOpen className="mx-auto mb-2 size-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Sem previsões ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione mais cupons para que a IA tenha dados suficientes.
            </p>
            <Button onClick={generate} variant="outline" className="mt-4" disabled={items.length === 0}>
              Tentar novamente
            </Button>
          </Card>
        ) : (
          alerts.map((alert, idx) => {
            const key = alert.product.toLowerCase();
            const matches =
              purchasesByProduct.get(key) ??
              [...purchasesByProduct.entries()]
                .filter(([k]) => k.includes(key) || key.includes(k))
                .flatMap(([, v]) => v);
            const isFocus = focusProduct && key.includes(focusProduct);
            const totalQty = matches.reduce((s, m) => s + Number(m.item.quantity), 0);
            const totalSpent = matches.reduce((s, m) => s + Number(m.item.total_price), 0);

            return (
              <Card
                key={`${alert.product}-${idx}`}
                className={`overflow-hidden p-5 shadow-card ${isFocus ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <span className="text-base font-bold leading-none tabular-nums">
                      {Math.max(0, Math.round(alert.days_left_estimate))}
                    </span>
                    <span className="text-[9px] font-medium uppercase leading-none">dias</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{alert.product}</p>
                    <Badge variant="secondary" className="mt-1 h-4 px-1.5 text-[9px]">
                      {CATEGORY_LABELS[alert.category] ?? alert.category}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground leading-snug">{alert.reason}</p>
                  </div>
                </div>

                {matches.length > 0 && (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium uppercase tracking-wider">Compras consideradas</span>
                      <span className="tabular-nums">
                        {totalQty.toFixed(0)} un · {formatBRL(totalSpent)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {matches.slice(0, 4).map((m) => (
                        <div key={m.item.id} className="flex items-center justify-between text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{m.receipt?.store_name ?? "—"}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {m.receipt ? formatDate(m.receipt.purchased_at) : ""} · {Number(m.item.quantity).toFixed(0)}× {formatBRL(Number(m.item.unit_price))}
                            </p>
                          </div>
                          <span className="ml-2 shrink-0 font-semibold tabular-nums">
                            {formatBRL(Number(m.item.total_price))}
                          </span>
                        </div>
                      ))}
                      {matches.length > 4 && (
                        <p className="text-[10px] text-muted-foreground">+ {matches.length - 4} compras anteriores</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
  onChange,
  min,
  max,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <p className="text-sm font-medium">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-8 items-center justify-center rounded-full border border-border text-base font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-8 items-center justify-center rounded-full border border-border text-base font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
