import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Sparkles, Plus, X, Copy, Share2, ShoppingBasket, Trash2, Check, Wand2,
} from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Item = Database["public"]["Tables"]["receipt_items"]["Row"];
type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
type Household = Database["public"]["Tables"]["household_profile"]["Row"];

type ListItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  source: "stock" | "frequent" | "manual";
  reason?: string;
  checked: boolean;
};

export const Route = createFileRoute("/lista")({
  head: () => ({
    meta: [
      { title: "Lista de compras — CuponizAI" },
      { name: "description", content: "Lista inteligente baseada em estoque baixo e seus hábitos." },
    ],
  }),
  component: ListaPage,
});

const STORAGE_KEY = "cuponizei:shopping-list";

function ListaPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [list, setList] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Carrega dados + lista persistida
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

      try {
        const saved = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
        if (saved) setList(JSON.parse(saved));
      } catch {
        // ignora
      }
      setLoading(false);
    })();
  }, [user]);

  // Persiste lista
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(list));
    } catch {
      // ignora
    }
  }, [list, user]);

  // Produtos mais frequentes (heurística local)
  const frequentProducts = useMemo(() => {
    const map = new Map<string, { count: number; category: string }>();
    items.forEach((it) => {
      const key = it.canonical_name || it.description;
      const cur = map.get(key);
      if (cur) cur.count += Number(it.quantity);
      else map.set(key, { count: Number(it.quantity), category: it.category });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, count: v.count, category: v.category }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  async function generateSmartList() {
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
      top_produtos: frequentProducts.slice(0, 5).map((p) => ({ nome: p.name, quantidade: p.count })),
      top_lojas: [],
      gastos_por_categoria: [],
      alertas_aumento: [],
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

    if (error || data?.error) {
      toast.error("Não consegui gerar agora.");
      setGenerating(false);
      return;
    }

    const stockAlerts = (data?.stock_alerts ?? []) as Array<{
      product: string;
      category: string;
      days_left_estimate: number;
      reason: string;
    }>;

    const fromStock: ListItem[] = stockAlerts.map((a) => ({
      id: `stock-${a.product}-${Date.now()}-${Math.random()}`,
      name: a.product,
      category: a.category || "outros",
      quantity: 1,
      source: "stock",
      reason: `Acaba em ~${Math.max(0, Math.round(a.days_left_estimate))} dias`,
      checked: false,
    }));

    // completa com produtos frequentes ainda não inclusos
    const stockNames = new Set(fromStock.map((s) => s.name.toLowerCase()));
    const fromFrequent: ListItem[] = frequentProducts
      .filter((p) => !stockNames.has(p.name.toLowerCase()))
      .slice(0, 6)
      .map((p) => ({
        id: `freq-${p.name}-${Date.now()}-${Math.random()}`,
        name: p.name,
        category: p.category,
        quantity: 1,
        source: "frequent",
        reason: `Você compra com frequência`,
        checked: false,
      }));

    // mantém itens manuais existentes
    const manuals = list.filter((l) => l.source === "manual");
    setList([...fromStock, ...fromFrequent, ...manuals]);
    setGenerating(false);
    toast.success("Lista atualizada!");
  }

  function addManual() {
    const name = newItem.trim();
    if (!name) return;
    setList((l) => [
      ...l,
      {
        id: `m-${Date.now()}`,
        name,
        category: "outros",
        quantity: 1,
        source: "manual",
        checked: false,
      },
    ]);
    setNewItem("");
  }

  function updateItem(id: string, patch: Partial<ListItem>) {
    setList((l) => l.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setList((l) => l.filter((it) => it.id !== id));
  }

  function clearChecked() {
    setList((l) => l.filter((it) => !it.checked));
  }

  function clearAll() {
    setList([]);
  }

  function buildText() {
    if (list.length === 0) return "";
    const lines = ["🛒 Lista de Compras", ""];
    const grouped = new Map<string, ListItem[]>();
    list.forEach((it) => {
      const k = it.category || "outros";
      const arr = grouped.get(k) ?? [];
      arr.push(it);
      grouped.set(k, arr);
    });
    [...grouped.entries()].forEach(([cat, arr]) => {
      lines.push(`*${CATEGORY_LABELS[cat] ?? cat}*`);
      arr.forEach((it) => {
        const mark = it.checked ? "✓" : "•";
        lines.push(`${mark} ${it.quantity > 1 ? `${it.quantity}x ` : ""}${it.name}`);
      });
      lines.push("");
    });
    lines.push("— CuponizAI");
    return lines.join("\n");
  }

  async function copyList() {
    const text = buildText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  async function shareList() {
    const text = buildText();
    if (!text) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Lista de compras", text });
      } catch {
        // usuário cancelou
      }
    } else {
      void copyList();
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    list.forEach((it) => {
      const k = it.category || "outros";
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    });
    return [...map.entries()];
  }, [list]);

  const checkedCount = list.filter((l) => l.checked).length;

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

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
          <ShoppingBasket className="size-5" />
          <h1 className="text-xl font-bold">Lista de compras</h1>
        </div>
        <p className="mt-1 text-xs opacity-90">
          {list.length === 0
            ? "Comece com um clique — a IA cuida do resto."
            : `${list.length} ${list.length === 1 ? "item" : "itens"} · ${checkedCount} no carrinho`}
        </p>
      </header>

      <div className="space-y-3 px-4 py-5">
        {/* Gerar com IA */}
        <Button
          onClick={generateSmartList}
          disabled={generating || loading || items.length === 0}
          className="w-full bg-gradient-primary text-base font-semibold shadow-elevated"
          size="lg"
        >
          <Wand2 className="size-4" />
          {generating ? "Pensando…" : list.length === 0 ? "Gerar lista inteligente" : "Atualizar com IA"}
        </Button>

        {items.length === 0 && (
          <Card className="p-6 text-center shadow-card">
            <ShoppingBasket className="mx-auto mb-2 size-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Sem dados para gerar lista</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione cupons primeiro para que a IA aprenda seus hábitos.
            </p>
          </Card>
        )}

        {/* Adicionar manual */}
        <Card className="p-3 shadow-card">
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar item…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addManual();
              }}
              maxLength={80}
              className="h-10"
            />
            <Button onClick={addManual} disabled={!newItem.trim()} size="icon" className="size-10 shrink-0">
              <Plus className="size-4" />
            </Button>
          </div>
        </Card>

        {/* Lista */}
        {list.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyList} className="h-8 text-xs">
                <Copy className="size-3.5" /> Copiar
              </Button>
              <Button variant="outline" size="sm" onClick={shareList} className="h-8 text-xs">
                <Share2 className="size-3.5" /> Compartilhar
              </Button>
              {checkedCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearChecked} className="h-8 text-xs">
                  <Check className="size-3.5" /> Remover marcados
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-8 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Limpar
              </Button>
            </div>

            {grouped.map(([cat, arr]) => (
              <Card key={cat} className="overflow-hidden p-0 shadow-card">
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {arr.length} {arr.length === 1 ? "item" : "itens"}
                  </span>
                </div>
                <ul className="divide-y divide-border/50">
                  {arr.map((it) => (
                    <li
                      key={it.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-all",
                        it.checked && "bg-muted/30",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => updateItem(it.id, { checked: !it.checked })}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                          it.checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/60",
                        )}
                      >
                        {it.checked && <Check className="size-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            it.checked && "text-muted-foreground line-through",
                          )}
                        >
                          {it.name}
                        </p>
                        {it.reason && !it.checked && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            {it.source === "stock" && <Sparkles className="size-2.5 text-primary" />}
                            {it.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateItem(it.id, { quantity: Math.max(1, it.quantity - 1) })}
                          disabled={it.quantity <= 1}
                          className="flex size-7 items-center justify-center rounded-full border border-border text-sm transition-colors hover:bg-muted disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-xs font-bold tabular-nums">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItem(it.id, { quantity: Math.min(99, it.quantity + 1) })}
                          className="flex size-7 items-center justify-center rounded-full border border-border text-sm transition-colors hover:bg-muted"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </>
        )}

        {list.length === 0 && !generating && items.length > 0 && (
          <Card className="p-6 text-center shadow-card">
            <Sparkles className="mx-auto mb-2 size-7 text-primary" />
            <p className="text-sm font-semibold">Sua lista está vazia</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Toque em "Gerar lista inteligente" ou adicione itens manualmente.
            </p>
          </Card>
        )}

        {list.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="default"
              onClick={copyList}
              className="h-12 bg-gradient-primary text-sm font-semibold shadow-elevated"
            >
              <Copy className="size-4" /> Copiar
            </Button>
            <Button variant="secondary" onClick={shareList} className="h-12 text-sm font-semibold">
              <Share2 className="size-4" /> Compartilhar
            </Button>
          </div>
        )}

        <Badge variant="secondary" className="mt-2 inline-flex h-5 px-2 text-[10px]">
          <Sparkles className="size-2.5 text-primary" />
          Sua lista é salva no aparelho
        </Badge>
      </div>
    </AppLayout>
  );
}
