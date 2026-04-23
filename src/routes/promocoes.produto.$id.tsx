import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscountBadge } from "@/components/promocoes/DiscountBadge";
import { Heart, MapPin, Plus, Clock } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { formatDistance, formatTimeLeft, haversineKm } from "@/lib/promo-score";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/promocoes/produto/$id")({
  head: () => ({ meta: [{ title: "Produto — Promoções CuponizAI" }] }),
  component: ProdutoPage,
});

type Product = { id: string; name: string; brand: string | null; image_emoji: string; unit: string };
type Promo = { id: string; store_id: string; price: number; original_price: number; discount_pct: number; ends_at: string };
type Store = { id: string; chain: string; logo_emoji: string; brand_color: string; lat: number | null; lng: number | null; address: string | null };
type Hist = { price: number; observed_at: string; store_id: string };

function ProdutoPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [stores, setStores] = useState<Map<string, Store>>(new Map());
  const [history, setHistory] = useState<Hist[]>([]);
  const [isFav, setIsFav] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [prodRes, promosRes, storesRes, histRes, favRes, locRes] = await Promise.all([
        supabase.from("promo_products").select("id, name, brand, image_emoji, unit").eq("id", id).maybeSingle(),
        supabase.from("promotions").select("id, store_id, price, original_price, discount_pct, ends_at").eq("product_id", id).eq("status", "ativa").gt("ends_at", new Date().toISOString()),
        supabase.from("promo_stores").select("id, chain, logo_emoji, brand_color, lat, lng, address"),
        supabase.from("promo_price_history").select("price, observed_at, store_id").eq("product_id", id).order("observed_at"),
        supabase.from("user_watchlist").select("id").eq("user_id", user.id).eq("product_id", id).maybeSingle(),
        supabase.from("user_location").select("lat, lng").eq("user_id", user.id).maybeSingle(),
      ]);
      setProduct((prodRes.data ?? null) as Product | null);
      setPromos(((promosRes.data ?? []) as Array<{ id: string; store_id: string; price: number | string; original_price: number | string; discount_pct: number | string; ends_at: string }>).map((p) => ({
        ...p,
        price: Number(p.price),
        original_price: Number(p.original_price),
        discount_pct: Number(p.discount_pct),
      })));
      const sm = new Map<string, Store>();
      for (const s of (storesRes.data ?? []) as Store[]) sm.set(s.id, s);
      setStores(sm);
      setHistory(((histRes.data ?? []) as Array<{ price: number | string; observed_at: string; store_id: string }>).map((h) => ({ ...h, price: Number(h.price) })));
      setIsFav(!!favRes.data);
      setUserLoc({ lat: (locRes.data?.lat as number | null) ?? null, lng: (locRes.data?.lng as number | null) ?? null });
      setLoading(false);
    })();
  }, [user, id]);

  const toggleFav = async () => {
    if (!user) return;
    if (isFav) {
      await supabase.from("user_watchlist").delete().eq("user_id", user.id).eq("product_id", id);
      setIsFav(false);
      toast.success("Removido dos favoritos");
    } else {
      await supabase.from("user_watchlist").insert({ user_id: user.id, product_id: id });
      setIsFav(true);
      toast.success("Adicionado aos favoritos");
    }
  };

  const addToList = () => {
    if (!product) return;
    try {
      const key = "cuponizei:shopping-list";
      const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        id: `promo-${product.id}`,
        name: product.name,
        qty: 1,
        unit: product.unit,
        checked: false,
        source: "promo",
      });
      localStorage.setItem(key, JSON.stringify(list));
      toast.success("Adicionado à sua lista de compras");
    } catch {
      toast.error("Não foi possível adicionar");
    }
  };

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const h of history) {
      const k = new Date(h.observed_at).toISOString().slice(0, 10);
      const cur = grouped.get(k);
      grouped.set(k, cur != null ? Math.min(cur, h.price) : h.price);
    }
    const arr = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, price]) => ({
        date: new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        price,
      }));
    if (promos.length) {
      arr.push({ date: "hoje", price: Math.min(...promos.map((p) => p.price)) });
    }
    return arr;
  }, [history, promos]);

  const sortedPromos = useMemo(() => [...promos].sort((a, b) => a.price - b.price), [promos]);

  return (
    <AppLayout>
      <PromoHeader
        title={product?.name ?? "Produto"}
        right={
          <button
            onClick={toggleFav}
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              isFav ? "bg-[var(--promo-hot)]/15 text-[var(--promo-hot)]" : "bg-muted text-muted-foreground",
            )}
          >
            <Heart className={cn("size-4", isFav && "fill-current")} />
          </button>
        }
      />
      <div className="space-y-5 px-4 py-4">
        {loading || !product ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : (
          <>
            <Card className="rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="flex size-20 items-center justify-center rounded-2xl bg-muted text-5xl">{product.image_emoji}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold">{product.name}</h2>
                  {product.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}
                  <p className="text-xs text-muted-foreground">por {product.unit}</p>
                </div>
              </div>
              <Button onClick={addToList} variant="outline" className="mt-4 w-full gap-2">
                <Plus className="size-4" /> Adicionar à lista de compras
              </Button>
            </Card>

            {chartData.length > 1 && (
              <Card className="rounded-2xl p-4">
                <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Histórico de preço</p>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="price" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            <section>
              <h3 className="mb-2 px-1 text-sm font-semibold">Ofertas ativas ({sortedPromos.length})</h3>
              <div className="space-y-2">
                {sortedPromos.length === 0 ? (
                  <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    Nenhuma oferta ativa para este produto
                  </Card>
                ) : (
                  sortedPromos.map((p, idx) => {
                    const s = stores.get(p.store_id);
                    if (!s) return null;
                    const dist = s.lat && s.lng && userLoc.lat && userLoc.lng ? haversineKm(userLoc.lat, userLoc.lng, s.lat, s.lng) : null;
                    const time = formatTimeLeft(p.ends_at);
                    return (
                      <Link key={p.id} to="/promocoes/mercado/$id" params={{ id: s.id }}>
                        <Card className={cn("rounded-2xl p-4", idx === 0 && "border-primary")}>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: s.brand_color + "20" }}>
                              {s.logo_emoji}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold">{s.chain}</p>
                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                                {dist != null && (
                                  <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" /> {formatDistance(dist)}</span>
                                )}
                                <span className={cn("inline-flex items-center gap-0.5", time.urgent && "text-destructive font-medium")}>
                                  <Clock className="size-3" /> {time.text}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <DiscountBadge pct={Number(p.discount_pct)} size="sm" />
                              <p className="mt-1 text-base font-bold text-primary tabular-nums">{formatBRL(p.price)}</p>
                              <p className="text-[10px] text-muted-foreground line-through">{formatBRL(p.original_price)}</p>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
