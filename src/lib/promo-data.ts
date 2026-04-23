import { supabase } from "@/integrations/supabase/client";
import type { PromoCardData } from "@/components/promocoes/PromoCard";
import {
  computeScore,
  haversineKm,
} from "@/lib/promo-score";

export type PromoRow = {
  id: string;
  product_id: string;
  store_id: string;
  price: number;
  original_price: number;
  discount_pct: number;
  ends_at: string;
  starts_at: string;
  stock_level: string;
  status: string;
  is_featured: boolean;
};

export type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  unit: string;
  image_emoji: string;
};

export type StoreRow = {
  id: string;
  name: string;
  chain: string;
  logo_emoji: string;
  brand_color: string;
  city_id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sort_order: number;
};

export type LocationRow = {
  user_id: string;
  city_id: string | null;
  lat: number | null;
  lng: number | null;
  radius_km: number;
};

export async function fetchActivePromotions(): Promise<{
  promotions: PromoRow[];
  products: Map<string, ProductRow>;
  stores: Map<string, StoreRow>;
  categories: Map<string, CategoryRow>;
}> {
  // RLS already filters: user sees public (user_id IS NULL) + own rows.
  const [promosRes, prodsRes, storesRes, catsRes] = await Promise.all([
    supabase
      .from("promotions")
      .select("*")
      .eq("status", "ativa")
      .gt("ends_at", new Date().toISOString())
      .order("discount_pct", { ascending: false })
      .limit(500),
    supabase.from("promo_products").select("*"),
    supabase.from("promo_stores").select("*"),
    supabase.from("promo_categories").select("*").order("sort_order"),
  ]);

  return {
    promotions: (promosRes.data ?? []) as unknown as PromoRow[],
    products: new Map(((prodsRes.data ?? []) as unknown as ProductRow[]).map((p) => [p.id, p])),
    stores: new Map(((storesRes.data ?? []) as unknown as StoreRow[]).map((s) => [s.id, s])),
    categories: new Map(((catsRes.data ?? []) as unknown as CategoryRow[]).map((c) => [c.id, c])),
  };
}

export async function fetchUserContext(userId: string) {
  const [locRes, householdRes, watchRes, eventsRes, itemsRes] = await Promise.all([
    supabase.from("user_location").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("household_profile").select("favorite_brands, favorite_stores").eq("user_id", userId).maybeSingle(),
    supabase.from("user_watchlist").select("product_id, target_price").eq("user_id", userId),
    supabase.from("user_promotion_events").select("promotion_id, event").eq("user_id", userId).gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString()),
    supabase
      .from("receipt_items")
      .select("canonical_name, description, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
      .limit(2000),
  ]);

  return {
    location: (locRes.data ?? null) as LocationRow | null,
    favoriteBrands: (householdRes.data?.favorite_brands ?? []) as string[],
    favoriteStores: (householdRes.data?.favorite_stores ?? []) as string[],
    watchlist: (watchRes.data ?? []) as { product_id: string; target_price: number | null }[],
    events: (eventsRes.data ?? []) as { promotion_id: string; event: string }[],
    purchases: (itemsRes.data ?? []) as { canonical_name: string | null; description: string }[],
  };
}

export async function buildProductFrequencyMap(
  purchases: { canonical_name: string | null; description: string }[],
): Promise<Map<string, number>> {
  // get all aliases
  const { data } = await supabase.from("promo_product_aliases").select("product_id, alias");
  const aliasToProduct = new Map<string, string>();
  for (const row of (data ?? []) as { product_id: string; alias: string }[]) {
    aliasToProduct.set(row.alias.toLowerCase(), row.product_id);
  }

  const counts = new Map<string, number>();
  for (const p of purchases) {
    const text = (p.canonical_name ?? p.description ?? "").toLowerCase();
    for (const [alias, pid] of aliasToProduct) {
      if (text.includes(alias)) {
        counts.set(pid, (counts.get(pid) ?? 0) + 1);
        break;
      }
    }
  }

  // normalize 0..1
  const max = Math.max(1, ...counts.values());
  const normalized = new Map<string, number>();
  for (const [pid, c] of counts) normalized.set(pid, c / max);
  return normalized;
}

export type RankedPromo = PromoCardData & {
  score: number;
};

export function rankPromotions(opts: {
  promotions: PromoRow[];
  products: Map<string, ProductRow>;
  stores: Map<string, StoreRow>;
  frequency: Map<string, number>;
  watchlist: Set<string>;
  favoriteBrands: string[];
  clicksByPromo: Map<string, number>;
  userLat: number | null;
  userLng: number | null;
  radiusKm: number;
}): RankedPromo[] {
  const maxClicks = Math.max(1, ...opts.clicksByPromo.values());
  return opts.promotions
    .map((p) => {
      const product = opts.products.get(p.product_id);
      const store = opts.stores.get(p.store_id);
      if (!product || !store) return null;
      const dist =
        store.lat != null && store.lng != null && opts.userLat != null && opts.userLng != null
          ? haversineKm(opts.userLat, opts.userLng, store.lat, store.lng)
          : null;
      const watchBoost = opts.watchlist.has(product.id) ? 0.15 : 0;
      const score =
        computeScore({
          productId: product.id,
          brand: product.brand,
          discountPct: Number(p.discount_pct),
          endsAt: p.ends_at,
          storeLat: store.lat,
          storeLng: store.lng,
          purchaseFrequency: opts.frequency.get(product.id) ?? 0,
          userLat: opts.userLat,
          userLng: opts.userLng,
          radiusKm: opts.radiusKm,
          favoriteBrands: opts.favoriteBrands,
          clickHistory: (opts.clicksByPromo.get(p.id) ?? 0) / maxClicks,
        }) + watchBoost;

      const card: RankedPromo = {
        id: p.id,
        product_id: product.id,
        price: Number(p.price),
        original_price: Number(p.original_price),
        discount_pct: Number(p.discount_pct),
        ends_at: p.ends_at,
        product_name: product.name,
        product_emoji: product.image_emoji,
        product_brand: product.brand,
        product_unit: product.unit,
        store_name: store.name,
        store_chain: store.chain,
        store_emoji: store.logo_emoji,
        store_color: store.brand_color,
        store_id: store.id,
        distance_km: dist,
        score,
      };
      return card;
    })
    .filter((x): x is RankedPromo => x !== null)
    .sort((a, b) => b.score - a.score);
}
