import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Trophy, ShoppingBasket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/promocoes/cesta")({
  head: () => ({ meta: [{ title: "Comparar cesta — CuponizAI" }] }),
  component: CestaPage,
});

type BasketItem = { product_id: string; name: string; emoji: string; qty: number };

type Promo = { product_id: string; store_id: string; price: number };
type Store = { id: string; chain: string; logo_emoji: string; brand_color: string };
type Product = { id: string; name: string; image_emoji: string };

function CestaPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [basket, setBasket] = useState<BasketItem[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pr, pm, st] = await Promise.all([
        supabase.from("promo_products").select("id, name, image_emoji").order("name"),
        supabase
          .from("promotions")
          .select("product_id, store_id, price")
          .eq("status", "ativa")
          .gt("ends_at", new Date().toISOString()),
        supabase.from("promo_stores").select("id, chain, logo_emoji, brand_color"),
      ]);
      setProducts((pr.data ?? []) as Product[]);
      setPromos(((pm.data ?? []) as { product_id: string; store_id: string; price: number | string }[]).map((p) => ({ ...p, price: Number(p.price) })));
      setStores((st.data ?? []) as Store[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 8);
    const s = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 8);
  }, [products, search]);

  const add = (p: Product) => {
    setBasket((prev) => {
      const ex = prev.find((b) => b.product_id === p.id);
      if (ex) return prev.map((b) => (b.product_id === p.id ? { ...b, qty: b.qty + 1 } : b));
      return [...prev, { product_id: p.id, name: p.name, emoji: p.image_emoji, qty: 1 }];
    });
    setSearch("");
  };
  const remove = (id: string) => setBasket((prev) => prev.filter((b) => b.product_id !== id));
  const setQty = (id: string, qty: number) => setBasket((prev) => prev.map((b) => (b.product_id === id ? { ...b, qty: Math.max(1, qty) } : b)));

  // Calcular totais por mercado: melhor preço de cada item (ou null se não disponível)
  const ranking = useMemo(() => {
    if (!basket.length) return [];
    return stores
      .map((store) => {
        let total = 0;
        let covered = 0;
        const items: { product_id: string; name: string; emoji: string; qty: number; price: number | null }[] = [];
        for (const b of basket) {
          const offers = promos.filter((p) => p.product_id === b.product_id && p.store_id === store.id);
          const best = offers.length ? Math.min(...offers.map((o) => o.price)) : null;
          if (best != null) {
            total += best * b.qty;
            covered++;
          }
          items.push({ ...b, price: best });
        }
        return { store, total, covered, items };
      })
      .sort((a, b) => {
        if (b.covered !== a.covered) return b.covered - a.covered;
        return a.total - b.total;
      });
  }, [basket, promos, stores]);

  const cheapest = ranking[0];
  const worst = ranking[ranking.length - 1];
  const economy = cheapest && worst && worst.total > 0 ? worst.total - cheapest.total : 0;

  // Cesta dividida: para cada item, o mercado com melhor preço
  const splitBasket = useMemo(() => {
    if (!basket.length) return new Map<string, { store: Store; total: number; items: BasketItem[] }>();
    const byStore = new Map<string, { store: Store; total: number; items: BasketItem[] }>();
    for (const b of basket) {
      let bestStoreId: string | null = null;
      let bestPrice = Infinity;
      for (const p of promos) {
        if (p.product_id === b.product_id && p.price < bestPrice) {
          bestPrice = p.price;
          bestStoreId = p.store_id;
        }
      }
      if (!bestStoreId) continue;
      const store = stores.find((s) => s.id === bestStoreId);
      if (!store) continue;
      const ex = byStore.get(bestStoreId) ?? { store, total: 0, items: [] };
      ex.total += bestPrice * b.qty;
      ex.items.push(b);
      byStore.set(bestStoreId, ex);
    }
    return byStore;
  }, [basket, promos, stores]);

  const splitTotal = useMemo(() => Array.from(splitBasket.values()).reduce((acc, s) => acc + s.total, 0), [splitBasket]);

  return (
    <AppLayout>
      <PromoHeader title="Comparar cesta" />
      <div className="space-y-5 px-4 py-4">
        <Card className="rounded-2xl p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Adicionar produto</p>
          <Input
            placeholder="Buscar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(search || filtered.length > 0) && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
              {loading
                ? <div className="p-3"><Skeleton className="h-4 w-1/2" /></div>
                : filtered.length === 0
                ? <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                : filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => add(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="text-lg">{p.image_emoji}</span>
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      <Plus className="size-4 text-primary" />
                    </button>
                  ))}
            </div>
          )}
        </Card>

        {basket.length === 0 ? (
          <Card className="rounded-2xl p-8 text-center">
            <ShoppingBasket className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Sua cesta está vazia</p>
            <p className="mt-1 text-xs text-muted-foreground">Adicione produtos para comparar mercados.</p>
          </Card>
        ) : (
          <>
            <Card className="rounded-2xl p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Sua cesta ({basket.length})</p>
              <div className="space-y-2">
                {basket.map((b) => (
                  <div key={b.product_id} className="flex items-center gap-2">
                    <span className="text-xl">{b.emoji}</span>
                    <span className="flex-1 truncate text-sm">{b.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(b.product_id, b.qty - 1)} className="flex size-7 items-center justify-center rounded border text-sm hover:bg-muted">−</button>
                      <span className="w-6 text-center text-sm font-medium">{b.qty}</span>
                      <button onClick={() => setQty(b.product_id, b.qty + 1)} className="flex size-7 items-center justify-center rounded border text-sm hover:bg-muted">+</button>
                    </div>
                    <button onClick={() => remove(b.product_id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            {economy > 0 && (
              <Card className="rounded-2xl border-0 bg-gradient-promo p-4 text-primary-foreground">
                <p className="text-xs font-medium uppercase tracking-wide opacity-80">Economia comprando no melhor mercado</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{formatBRL(economy)}</p>
                <p className="mt-1 text-xs opacity-90">vs comprar tudo no mercado mais caro</p>
              </Card>
            )}

            <section>
              <h2 className="mb-2 px-1 text-sm font-semibold">Comparativo por mercado</h2>
              <div className="space-y-2">
                {ranking.map((r, idx) => (
                  <Card key={r.store.id} className={cn("rounded-2xl p-4", idx === 0 && "border-primary bg-primary/5")}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{r.store.logo_emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{r.store.chain}</p>
                          {idx === 0 && <Trophy className="size-4 text-[var(--promo-hot)]" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{r.covered}/{basket.length} itens disponíveis</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums">{r.total > 0 ? formatBRL(r.total) : "—"}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {splitBasket.size > 1 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-semibold">💡 Cesta dividida (melhor preço por item)</h2>
                <Card className="rounded-2xl p-4">
                  <p className="mb-3 text-xs text-muted-foreground">Comprando o melhor preço de cada item em mercados diferentes:</p>
                  <div className="space-y-3">
                    {Array.from(splitBasket.values()).map((s) => (
                      <div key={s.store.id} className="rounded-lg bg-muted/50 p-3">
                        <p className="mb-1 text-sm font-semibold">{s.store.logo_emoji} {s.store.chain}</p>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {s.items.map((i) => <li key={i.product_id}>• {i.name} ×{i.qty}</li>)}
                        </ul>
                        <p className="mt-1 text-right text-sm font-medium">{formatBRL(s.total)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium">Total dividido</span>
                    <span className="text-lg font-bold text-primary tabular-nums">{formatBRL(splitTotal)}</span>
                  </div>
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
