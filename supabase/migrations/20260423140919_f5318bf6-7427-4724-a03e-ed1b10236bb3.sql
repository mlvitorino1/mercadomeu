-- ============================================
-- TABELAS PÚBLICAS (catálogo de promoções)
-- ============================================

-- Cidades
CREATE TABLE public.cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  lat NUMERIC(10, 6) NOT NULL,
  lng NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mercados/Lojas da rede de promoções
CREATE TABLE public.promo_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  logo_emoji TEXT NOT NULL DEFAULT '🛒',
  brand_color TEXT NOT NULL DEFAULT '#16a34a',
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  address TEXT,
  lat NUMERIC(10, 6),
  lng NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias de produtos
CREATE TABLE public.promo_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Package',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo de produtos
CREATE TABLE public.promo_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  category_id UUID REFERENCES public.promo_categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'un',
  image_emoji TEXT NOT NULL DEFAULT '📦',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aliases para casar com receipt_items.canonical_name
CREATE TABLE public.promo_product_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.promo_products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, alias)
);

-- Promoções
CREATE TABLE public.promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.promo_products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.promo_stores(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2) NOT NULL,
  discount_pct NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE WHEN original_price > 0 
      THEN ROUND(((original_price - price) / original_price) * 100, 2)
      ELSE 0 END
  ) STORED,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  stock_level TEXT NOT NULL DEFAULT 'alto' CHECK (stock_level IN ('alto', 'medio', 'baixo')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'scraper', 'parceiro')),
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'expirada', 'pausada')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotions_store_ends ON public.promotions (store_id, ends_at);
CREATE INDEX idx_promotions_product_ends ON public.promotions (product_id, ends_at);
CREATE INDEX idx_promotions_status_ends ON public.promotions (status, ends_at);
CREATE INDEX idx_promotions_featured ON public.promotions (is_featured) WHERE is_featured = true;

-- Histórico de preços
CREATE TABLE public.promo_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.promo_products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.promo_stores(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_product ON public.promo_price_history (product_id, observed_at DESC);

-- ============================================
-- TABELAS PRIVADAS (por usuário)
-- ============================================

CREATE TABLE public.user_watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.promo_products(id) ON DELETE CASCADE,
  target_price NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX idx_watchlist_user ON public.user_watchlist (user_id);

CREATE TABLE public.user_promotion_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('view', 'click', 'dismiss', 'save')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_user_promo ON public.user_promotion_events (user_id, promotion_id);

CREATE TABLE public.promo_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('price_drop', 'ending_today', 'favorite_on_sale', 'basket_match')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  promotion_id UUID REFERENCES public.promotions(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.promo_notifications (user_id, read_at);

CREATE TABLE public.user_location (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  lat NUMERIC(10, 6),
  lng NUMERIC(10, 6),
  radius_km NUMERIC(5, 2) NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ENABLE RLS
-- ============================================
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_promotion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS DE LEITURA PÚBLICA (autenticados)
-- ============================================
CREATE POLICY "cities: public read" ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_stores: public read" ON public.promo_stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_categories: public read" ON public.promo_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_products: public read" ON public.promo_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_product_aliases: public read" ON public.promo_product_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "promotions: public read" ON public.promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_price_history: public read" ON public.promo_price_history FOR SELECT TO authenticated USING (true);

-- ============================================
-- POLÍTICAS PRIVADAS (own)
-- ============================================
CREATE POLICY "watchlist: own select" ON public.user_watchlist FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "watchlist: own insert" ON public.user_watchlist FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist: own update" ON public.user_watchlist FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "watchlist: own delete" ON public.user_watchlist FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "events: own select" ON public.user_promotion_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "events: own insert" ON public.user_promotion_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications: own select" ON public.promo_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications: own update" ON public.promo_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications: own delete" ON public.promo_notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "location: own select" ON public.user_location FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "location: own insert" ON public.user_location FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "location: own update" ON public.user_location FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "location: own delete" ON public.user_location FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER trg_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_location_updated_at
  BEFORE UPDATE ON public.user_location
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();