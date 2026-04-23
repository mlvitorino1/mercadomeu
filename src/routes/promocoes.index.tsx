import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PromoCard } from "@/components/promocoes/PromoCard";
import { StoreChip } from "@/components/promocoes/StoreChip";
import { EconomyMeter } from "@/components/promocoes/EconomyMeter";
import {
  fetchActivePromotions,
  fetchUserContext,
  buildProductFrequencyMap,
  rankPromotions,
  type RankedPromo,
} from "@/lib/promo-data";
import { Bell, Heart, Search, ShoppingBasket, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/promocoes/")({
  head: () => ({
    meta: [
      { title: "Promoções — CuponizAI" },
      { name: "description", content: "Promoções inteligentes recomendadas pra você." },
    ],
  }),
  component: PromocoesHome,
});

function PromocoesHome() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState<RankedPromo[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; chain: string; name: string; logo_emoji: string; brand_color: string }>>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [data, ctx, alertsRes] = await Promise.all([
        fetchActivePromotions(),
        fetchUserContext(user.id),
        supabase.from("promo_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      ]);
      setUnreadAlerts(alertsRes.count ?? 0);
      const freq = await buildProductFrequencyMap(ctx.purchases);
      const clicks = new Map<string, number>();
      ctx.events.filter((e) => e.event === "click").forEach((e) => clicks.set(e.promotion_id, (clicks.get(e.promotion_id) ?? 0) + 1));
      const r = rankPromotions({
        promotions: data.promotions,
        products: data.products,
        stores: data.stores,
        frequency: freq,
        watchlist: new Set(ctx.watchlist.map((w) => w.product_id)),
        favoriteBrands: ctx.favoriteBrands,
        clicksByPromo: clicks,
        userLat: ctx.location?.lat ?? null,
        userLng: ctx.location?.lng ?? null,
        radiusKm: ctx.location?.radius_km ?? 5,
      });
      setRanked(r);
      setStores(Array.from(data.stores.values()));
      setLoading(false);
    })();
  }, [user]);

  const economyToday = useMemo(() => {
    return ranked.slice(0, 20).reduce((acc, p) => acc + (p.original_price - p.price), 0);
  }, [ranked]);

  const nearby = useMemo(
    () => ranked.filter((p) => p.distance_km != null && p.distance_km <= 5).slice(0, 6),
    [ranked],
  );
  const recommended = useMemo(() => ranked.slice(0, 8), [ranked]);
  const yourProducts = useMemo(
    () => ranked.filter((p) => p.score >= 0.3).slice(0, 6),
    [ranked],
  );

  return (
    <AppLayout>
      <div className="space-y-5 px-4 py-5">
        {/* Hero */}
        <Card className="relative overflow-hidden rounded-3xl border-0 bg-gradient-promo p-5 shadow-elevated">
          <div className="absolute right-3 top-3 flex gap-2">
            <Link
              to="/promocoes/alertas"
              className="relative flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur"
            >
              <Bell className="size-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[var(--promo-hot)]">
                  {unreadAlerts}
                </span>
              )}
            </Link>
            <Link
              to="/promocoes/favoritos"
              className="flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur"
            >
              <Heart className="size-4" />
            </Link>
          </div>
          {loading ? (
            <Skeleton className="h-12 w-3/4 bg-white/20" />
          ) : (
            <EconomyMeter value={economyToday} />
          )}
          <p className="mt-2 text-xs text-primary-foreground/80">
            Somando as 20 melhores ofertas pra você hoje
          </p>
          <div className="mt-4 flex gap-2">
            <Link to="/promocoes/explorar" className="flex-1">
              <Button variant="secondary" className="w-full gap-2">
                <Search className="size-4" /> Explorar
              </Button>
            </Link>
            <Link to="/promocoes/cesta" className="flex-1">
              <Button variant="secondary" className="w-full gap-2">
                <ShoppingBasket className="size-4" /> Cesta
              </Button>
            </Link>
          </div>
        </Card>

        {/* Mercados parceiros */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-foreground">Mercados parceiros</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />)
              : stores.map((s) => <StoreChip key={s.id} store={s} className="shrink-0" />)}
          </div>
        </section>

        {/* Perto de você */}
        {!loading && nearby.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Perto de você</h2>
              <Link to="/promocoes/explorar" className="text-xs font-medium text-primary">Ver todos</Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {nearby.map((p) => (
                <div key={p.id} className="w-72 shrink-0">
                  <PromoCard promo={p} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recomendadas */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Recomendadas pra você</h2>
          </div>
          <div className="space-y-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
              : recommended.length === 0
              ? <EmptyState />
              : recommended.map((p) => <PromoCard key={p.id} promo={p} />)}
          </div>
        </section>

        {/* Seus produtos */}
        {!loading && yourProducts.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <Tag className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Seus produtos em oferta</h2>
            </div>
            <div className="space-y-3">
              {yourProducts.map((p) => <PromoCard key={p.id} promo={p} />)}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}

function EmptyState() {
  return (
    <Card className="rounded-2xl p-6 text-center">
      <Tag className="mx-auto size-10 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Nenhuma oferta ativa</p>
      <p className="mt-1 text-xs text-muted-foreground">Volte mais tarde — atualizamos diariamente às 6h.</p>
    </Card>
  );
}
