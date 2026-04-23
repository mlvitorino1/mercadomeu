import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PromoCard } from "@/components/promocoes/PromoCard";
import { MapPin, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchActivePromotions, fetchUserContext, buildProductFrequencyMap, rankPromotions, type RankedPromo } from "@/lib/promo-data";

export const Route = createFileRoute("/promocoes/mercado/$id")({
  head: () => ({ meta: [{ title: "Mercado — Promoções CuponizAI" }] }),
  component: MercadoPage,
});

type Store = {
  id: string;
  name: string;
  chain: string;
  logo_emoji: string;
  brand_color: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

function MercadoPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [storePromos, setStorePromos] = useState<RankedPromo[]>([]);
  const [productCategoryMap, setProductCategoryMap] = useState<Map<string, { id: string; name: string }>>(new Map());

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [storeRes, data, ctx] = await Promise.all([
        supabase.from("promo_stores").select("*").eq("id", id).maybeSingle(),
        fetchActivePromotions(),
        fetchUserContext(user.id),
      ]);
      setStore((storeRes.data ?? null) as Store | null);
      const freq = await buildProductFrequencyMap(ctx.purchases);
      const r = rankPromotions({
        promotions: data.promotions.filter((p) => p.store_id === id),
        products: data.products,
        stores: data.stores,
        frequency: freq,
        watchlist: new Set(ctx.watchlist.map((w) => w.product_id)),
        favoriteBrands: ctx.favoriteBrands,
        clicksByPromo: new Map(),
        userLat: ctx.location?.lat ?? null,
        userLng: ctx.location?.lng ?? null,
        radiusKm: ctx.location?.radius_km ?? 5,
      });
      setStorePromos(r);
      const m = new Map<string, { id: string; name: string }>();
      for (const p of data.products.values()) {
        if (p.category_id) {
          const c = data.categories.get(p.category_id);
          if (c) m.set(p.id, { id: c.id, name: c.name });
        }
      }
      setProductCategoryMap(m);
      setLoading(false);
    })();
  }, [user, id]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: RankedPromo[] }>();
    for (const p of storePromos) {
      const cat = productCategoryMap.get(p.product_id);
      const key = cat?.id ?? "outros";
      const name = cat?.name ?? "Outros";
      const e = map.get(key) ?? { name, items: [] };
      e.items.push(p);
      map.set(key, e);
    }
    return Array.from(map.entries());
  }, [storePromos, productCategoryMap]);

  return (
    <AppLayout>
      <PromoHeader title={store?.chain ?? "Mercado"} />
      {store && (
        <div
          className="px-4 py-5 text-white"
          style={{ background: `linear-gradient(135deg, ${store.brand_color}, ${store.brand_color}dd)` }}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
              {store.logo_emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{store.name}</h1>
              {store.address && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/90">
                  <MapPin className="size-3 shrink-0" />
                  {store.address}
                </p>
              )}
            </div>
          </div>
          {store.lat && store.lng && (
            <a
              href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block"
            >
              <Button variant="secondary" size="sm" className="gap-1.5">
                <ExternalLink className="size-3" />
                Abrir no mapa
              </Button>
            </a>
          )}
        </div>
      )}

      <div className="space-y-5 px-4 py-4">
        {loading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : storePromos.length === 0 ? (
          <Card className="rounded-2xl p-8 text-center">
            <p className="text-sm font-medium">Nenhuma oferta ativa neste mercado</p>
          </Card>
        ) : (
          grouped.map(([key, group]) => (
            <section key={key}>
              <h2 className="mb-2 px-1 text-sm font-semibold">{group.name} <span className="text-muted-foreground">({group.items.length})</span></h2>
              <div className="space-y-3">
                {group.items.map((p) => <PromoCard key={p.id} promo={p} compact />)}
              </div>
            </section>
          ))
        )}
      </div>
    </AppLayout>
  );
}
