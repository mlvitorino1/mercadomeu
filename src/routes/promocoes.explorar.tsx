import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { PromoCard } from "@/components/promocoes/PromoCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import {
  fetchActivePromotions,
  fetchUserContext,
  buildProductFrequencyMap,
  rankPromotions,
  type RankedPromo,
} from "@/lib/promo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/promocoes/explorar")({
  head: () => ({ meta: [{ title: "Explorar — Promoções CuponizAI" }] }),
  component: ExplorarPage,
});

type Validity = "todas" | "hoje" | "semana" | "mes";

function ExplorarPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<RankedPromo[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; chain: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [productCategoryMap, setProductCategoryMap] = useState<Map<string, string>>(new Map());

  // Filters
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [minDiscount, setMinDiscount] = useState(0);
  const [maxPrice, setMaxPrice] = useState(200);
  const [maxDistance, setMaxDistance] = useState(20);
  const [validity, setValidity] = useState<Validity>("todas");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [data, ctx] = await Promise.all([fetchActivePromotions(), fetchUserContext(user.id)]);
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
      setAll(r);
      setStores(Array.from(data.stores.values()).map((s) => ({ id: s.id, chain: s.chain })));
      setCategories(Array.from(data.categories.values()).map((c) => ({ id: c.id, name: c.name, slug: c.slug })));
      const map = new Map<string, string>();
      for (const p of data.products.values()) if (p.category_id) map.set(p.id, p.category_id);
      setProductCategoryMap(map);
      setLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return all.filter((p) => {
      if (storeFilter.size && !storeFilter.has(p.store_id)) return false;
      if (categoryFilter.size) {
        const c = productCategoryMap.get(p.product_id);
        if (!c || !categoryFilter.has(c)) return false;
      }
      if (Number(p.discount_pct) < minDiscount) return false;
      if (Number(p.price) > maxPrice) return false;
      if (p.distance_km != null && p.distance_km > maxDistance) return false;
      if (validity !== "todas") {
        const ms = new Date(p.ends_at).getTime() - now;
        const limits = { hoje: 86400000, semana: 7 * 86400000, mes: 30 * 86400000 };
        if (ms > limits[validity]) return false;
      }
      return true;
    });
  }, [all, storeFilter, categoryFilter, minDiscount, maxPrice, maxDistance, validity, productCategoryMap]);

  const activeFilters =
    storeFilter.size +
    categoryFilter.size +
    (minDiscount > 0 ? 1 : 0) +
    (maxPrice < 200 ? 1 : 0) +
    (maxDistance < 20 ? 1 : 0) +
    (validity !== "todas" ? 1 : 0);

  const reset = () => {
    setStoreFilter(new Set());
    setCategoryFilter(new Set());
    setMinDiscount(0);
    setMaxPrice(200);
    setMaxDistance(20);
    setValidity("todas");
  };

  return (
    <AppLayout>
      <PromoHeader
        title="Explorar ofertas"
        right={
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="relative gap-1.5">
                <Filter className="size-4" />
                Filtros
                {activeFilters > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 px-1">{activeFilters}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6 px-1">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mercado</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stores.map((s) => (
                      <Chip
                        key={s.id}
                        active={storeFilter.has(s.id)}
                        onClick={() => {
                          const n = new Set(storeFilter);
                          n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                          setStoreFilter(n);
                        }}
                      >
                        {s.chain}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Categoria</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <Chip
                        key={c.id}
                        active={categoryFilter.has(c.id)}
                        onClick={() => {
                          const n = new Set(categoryFilter);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          setCategoryFilter(n);
                        }}
                      >
                        {c.name}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Desconto mínimo</p>
                    <span className="text-xs font-medium">{minDiscount}%</span>
                  </div>
                  <Slider value={[minDiscount]} onValueChange={(v) => setMinDiscount(v[0])} max={70} step={5} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Preço máximo</p>
                    <span className="text-xs font-medium">R$ {maxPrice}</span>
                  </div>
                  <Slider value={[maxPrice]} onValueChange={(v) => setMaxPrice(v[0])} min={5} max={200} step={5} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Distância máxima</p>
                    <span className="text-xs font-medium">{maxDistance}km</span>
                  </div>
                  <Slider value={[maxDistance]} onValueChange={(v) => setMaxDistance(v[0])} min={1} max={20} step={1} />
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Validade</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["todas", "hoje", "semana", "mes"] as Validity[]).map((v) => (
                      <Chip key={v} active={validity === v} onClick={() => setValidity(v)}>
                        {v === "todas" ? "Todas" : v === "hoje" ? "Hoje" : v === "semana" ? "Semana" : "Mês"}
                      </Chip>
                    ))}
                  </div>
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={reset}>
                  <X className="size-4" />
                  Limpar filtros
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      <div className="px-4 py-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {loading ? "Carregando…" : `${filtered.length} oferta${filtered.length === 1 ? "" : "s"} encontrada${filtered.length === 1 ? "" : "s"}`}
        </p>
        <div className="space-y-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
            : filtered.map((p) => <PromoCard key={p.id} promo={p} />)}
        </div>
      </div>
    </AppLayout>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
