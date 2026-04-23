import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PriceSparkline } from "@/components/promocoes/PriceSparkline";
import { Heart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/promocoes/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos — Promoções CuponizAI" }] }),
  component: FavoritosPage,
});

type Item = {
  product_id: string;
  product_name: string;
  product_emoji: string;
  product_brand: string | null;
  target_price: number | null;
  current_best_price: number | null;
  history: { date: string; price: number }[];
  on_sale: boolean;
};

function FavoritosPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: watch } = await supabase
      .from("user_watchlist")
      .select("product_id, target_price")
      .eq("user_id", user.id);
    const list = (watch ?? []) as { product_id: string; target_price: number | null }[];
    if (!list.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ids = list.map((w) => w.product_id);
    const [prodsRes, promosRes, histRes] = await Promise.all([
      supabase.from("promo_products").select("id, name, image_emoji, brand").in("id", ids),
      supabase
        .from("promotions")
        .select("product_id, price")
        .eq("status", "ativa")
        .in("product_id", ids)
        .gt("ends_at", new Date().toISOString()),
      supabase
        .from("promo_price_history")
        .select("product_id, price, observed_at")
        .in("product_id", ids)
        .order("observed_at", { ascending: true }),
    ]);
    const prods = new Map<string, { id: string; name: string; image_emoji: string; brand: string | null }>();
    for (const p of (prodsRes.data ?? []) as { id: string; name: string; image_emoji: string; brand: string | null }[]) prods.set(p.id, p);

    const bestByProduct = new Map<string, number>();
    for (const p of (promosRes.data ?? []) as { product_id: string; price: number | string }[]) {
      const cur = bestByProduct.get(p.product_id) ?? Infinity;
      bestByProduct.set(p.product_id, Math.min(cur, Number(p.price)));
    }

    const histByProduct = new Map<string, { date: string; price: number }[]>();
    for (const h of (histRes.data ?? []) as { product_id: string; price: number | string; observed_at: string }[]) {
      const arr = histByProduct.get(h.product_id) ?? [];
      arr.push({ date: new Date(h.observed_at).toLocaleDateString("pt-BR", { month: "short" }), price: Number(h.price) });
      histByProduct.set(h.product_id, arr);
    }

    setItems(
      list
        .map((w) => {
          const prod = prods.get(w.product_id);
          if (!prod) return null;
          const best = bestByProduct.get(w.product_id) ?? null;
          const hist = histByProduct.get(w.product_id) ?? [];
          if (best != null) hist.push({ date: "agora", price: best });
          return {
            product_id: w.product_id,
            product_name: prod.name,
            product_emoji: prod.image_emoji,
            product_brand: prod.brand,
            target_price: w.target_price,
            current_best_price: best,
            history: hist,
            on_sale: best != null,
          } satisfies Item;
        })
        .filter((x): x is Item => x !== null),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const remove = async (productId: string) => {
    if (!user) return;
    await supabase.from("user_watchlist").delete().eq("user_id", user.id).eq("product_id", productId);
    toast.success("Removido dos favoritos");
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  return (
    <AppLayout>
      <PromoHeader title="Favoritos" />
      <div className="space-y-3 px-4 py-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : items.length === 0 ? (
          <Card className="rounded-2xl p-8 text-center">
            <Heart className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nenhum favorito ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Toque no coração de um produto para acompanhá-lo.</p>
          </Card>
        ) : (
          items.map((i) => (
            <Card key={i.product_id} className="rounded-2xl p-4">
              <div className="flex gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                  {i.product_emoji}
                </div>
                <Link to="/promocoes/produto/$id" params={{ id: i.product_id }} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.product_name}</p>
                  {i.product_brand && <p className="text-xs text-muted-foreground">{i.product_brand}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    {i.current_best_price != null ? (
                      <span className="text-base font-bold text-primary tabular-nums">{formatBRL(i.current_best_price)}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem ofertas ativas</span>
                    )}
                    {i.on_sale && <Badge className="bg-[var(--promo-hot)] text-white">em oferta</Badge>}
                  </div>
                </Link>
                <button onClick={() => remove(i.product_id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
              {i.history.length > 1 && (
                <div className="mt-3">
                  <PriceSparkline data={i.history} />
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </AppLayout>
  );
}
