import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PromoCard } from "@/components/promocoes/PromoCard";
import { StoreChip } from "@/components/promocoes/StoreChip";
import { EconomyMeter } from "@/components/promocoes/EconomyMeter";
import { FlyerStatusChip, type FlyerStatus } from "@/components/promocoes/FlyerStatusChip";
import { FlyerHistoryItem, type FlyerHistoryRow } from "@/components/promocoes/FlyerHistoryItem";
import { EmptyPromocoes } from "@/components/promocoes/EmptyPromocoes";
import {
  fetchActivePromotions, fetchUserContext, buildProductFrequencyMap,
  rankPromotions, type RankedPromo,
} from "@/lib/promo-data";
import { Bell, Heart, Plus, Sparkles, Tag, Clock, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/promocoes/")({
  head: () => ({
    meta: [
      { title: "Promoções — CuponizAI" },
      { name: "description", content: "Promoções extraídas dos panfletos dos seus mercados favoritos." },
    ],
  }),
  component: PromocoesHome,
});

type FlyerRow = {
  id: string; status: FlyerStatus; source_kind: string;
  store_id: string | null; extracted_count: number;
  created_at: string; error_message: string | null;
};

function PromocoesHome() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState<RankedPromo[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; chain: string; name: string; logo_emoji: string; brand_color: string }>>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [flyers, setFlyers] = useState<FlyerHistoryRow[]>([]);
  const [myPromoIds, setMyPromoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [data, ctx, alertsRes, flyersRes, myPromosRes] = await Promise.all([
      fetchActivePromotions(),
      fetchUserContext(user.id),
      supabase.from("promo_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase.from("promo_flyers").select("id, status, source_kind, store_id, extracted_count, created_at, error_message")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("promotions").select("id").eq("user_id", user.id),
    ]);
    setUnreadAlerts(alertsRes.count ?? 0);
    setMyPromoIds(new Set(((myPromosRes.data ?? []) as { id: string }[]).map((r) => r.id)));

    const freq = await buildProductFrequencyMap(ctx.purchases);
    const clicks = new Map<string, number>();
    ctx.events.filter((e) => e.event === "click").forEach((e) => clicks.set(e.promotion_id, (clicks.get(e.promotion_id) ?? 0) + 1));
    const r = rankPromotions({
      promotions: data.promotions, products: data.products, stores: data.stores,
      frequency: freq, watchlist: new Set(ctx.watchlist.map((w) => w.product_id)),
      favoriteBrands: ctx.favoriteBrands, clicksByPromo: clicks,
      userLat: ctx.location?.lat ?? null, userLng: ctx.location?.lng ?? null,
      radiusKm: ctx.location?.radius_km ?? 5,
    });
    setRanked(r);
    setStores(Array.from(data.stores.values()));

    // enrich flyers with store names
    const rawFlyers = (flyersRes.data ?? []) as FlyerRow[];
    const enriched: FlyerHistoryRow[] = rawFlyers.map((f) => ({
      ...f, store_name: f.store_id ? data.stores.get(f.store_id)?.name ?? null : null,
    }));
    setFlyers(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Poll while any flyer is processing
  useEffect(() => {
    const hasProcessing = flyers.some((f) => f.status === "pending" || f.status === "processing");
    if (!hasProcessing) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [flyers, load]);

  const myPromos = useMemo(() => ranked.filter((p) => myPromoIds.has(p.id)), [ranked, myPromoIds]);
  const endingToday = useMemo(() => {
    const end = Date.now() + 24 * 3600 * 1000;
    return ranked.filter((p) => new Date(p.ends_at).getTime() <= end).slice(0, 6);
  }, [ranked]);
  const recommended = useMemo(() => ranked.slice(0, 8), [ranked]);

  const economyToday = useMemo(
    () => myPromos.slice(0, 20).reduce((acc, p) => acc + (p.original_price - p.price), 0),
    [myPromos],
  );

  async function handleDelete(id: string) {
    if (!confirm("Excluir este panfleto e suas promoções?")) return;
    const { error } = await supabase.from("promo_flyers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Panfleto excluído"); void load(); }
  }

  async function handleReprocess(id: string) {
    await supabase.from("promo_flyers").update({ status: "pending", error_message: null }).eq("id", id);
    supabase.functions.invoke("extract-flyer", { body: { flyer_id: id } }).catch(() => {});
    toast.info("Reprocessando…");
    void load();
  }

  const noFlyers = !loading && flyers.length === 0;

  return (
    <AppLayout>
      <div className="space-y-5 px-4 py-5">
        {/* Header */}
        <Card className="relative overflow-hidden rounded-3xl border-0 bg-gradient-promo p-5 shadow-elevated">
          <div className="absolute right-3 top-3 flex gap-2">
            <Link to="/promocoes/alertas" className="relative flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur">
              <Bell className="size-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[var(--promo-hot)]">
                  {unreadAlerts}
                </span>
              )}
            </Link>
            <Link to="/promocoes/favoritos" className="flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur">
              <Heart className="size-4" />
            </Link>
          </div>
          {loading ? (
            <Skeleton className="h-12 w-3/4 bg-white/20" />
          ) : (
            <EconomyMeter value={economyToday} />
          )}
          <p className="mt-2 text-xs text-primary-foreground/80">
            {myPromos.length > 0
              ? `${myPromos.length} ofertas dos seus panfletos`
              : "Cadastre um panfleto pra começar a economizar"}
          </p>
          <Link to="/promocoes/cadastrar" className="mt-4 block">
            <Button variant="secondary" className="w-full gap-2">
              <Plus className="size-4" /> Cadastrar panfleto
            </Button>
          </Link>
        </Card>

        {/* Flyer chips */}
        {!loading && flyers.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold">Seus panfletos</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {flyers.slice(0, 8).map((f) => (
                <div key={f.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
                  <Store className="size-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium">{f.store_name ?? "Mercado"}</span>
                  <FlyerStatusChip status={f.status} />
                </div>
              ))}
              <Link to="/promocoes/cadastrar" className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary px-2.5 py-1 text-[11px] font-semibold text-primary">
                <Plus className="size-3" /> Novo
              </Link>
            </div>
          </section>
        )}

        {noFlyers && <EmptyPromocoes />}

        {/* Suas promoções */}
        {!loading && myPromos.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <Tag className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Suas promoções ativas</h2>
            </div>
            <div className="space-y-3">
              {myPromos.slice(0, 8).map((p) => <PromoCard key={p.id} promo={p} />)}
            </div>
          </section>
        )}

        {/* Acabando hoje */}
        {!loading && endingToday.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <Clock className="size-4 text-[var(--promo-hot)]" />
              <h2 className="text-sm font-semibold">Acabando hoje</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {endingToday.map((p) => (
                <div key={p.id} className="w-72 shrink-0"><PromoCard promo={p} /></div>
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
              ? null
              : recommended.map((p) => <PromoCard key={p.id} promo={p} />)}
          </div>
        </section>

        {/* Mercados parceiros */}
        {!loading && stores.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold">Mercados</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {stores.map((s) => <StoreChip key={s.id} store={s} className="shrink-0" />)}
            </div>
          </section>
        )}

        {/* Histórico */}
        {!loading && flyers.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold">Histórico de panfletos</h2>
            <div className="space-y-2">
              {flyers.map((f) => (
                <FlyerHistoryItem key={f.id} flyer={f} onDelete={handleDelete} onReprocess={handleReprocess} />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
