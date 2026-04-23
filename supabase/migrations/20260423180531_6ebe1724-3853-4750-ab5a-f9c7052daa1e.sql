
-- 1. promo_flyers table
CREATE TABLE public.promo_flyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NULL REFERENCES public.promo_stores(id) ON DELETE SET NULL,
  store_name_guess text NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('html_url','file_url','upload_pdf','upload_image')),
  source_url text NULL,
  storage_path text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  error_message text NULL,
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  extracted_count integer NOT NULL DEFAULT 0,
  raw_extraction jsonb NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_flyers_user_status ON public.promo_flyers(user_id, status);

ALTER TABLE public.promo_flyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flyers: own select" ON public.promo_flyers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "flyers: own insert" ON public.promo_flyers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "flyers: own update" ON public.promo_flyers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "flyers: own delete" ON public.promo_flyers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER promo_flyers_updated_at
  BEFORE UPDATE ON public.promo_flyers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. promotions: add user_id + flyer_id
ALTER TABLE public.promotions
  ADD COLUMN user_id uuid NULL,
  ADD COLUMN flyer_id uuid NULL REFERENCES public.promo_flyers(id) ON DELETE CASCADE;

CREATE INDEX idx_promotions_user ON public.promotions(user_id);
CREATE INDEX idx_promotions_flyer ON public.promotions(flyer_id);

DROP POLICY IF EXISTS "promotions: public read" ON public.promotions;
CREATE POLICY "promotions: visible read" ON public.promotions
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "promotions: own insert" ON public.promotions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "promotions: own update" ON public.promotions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "promotions: own delete" ON public.promotions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. promo_stores: add user_id (nullable = public)
ALTER TABLE public.promo_stores
  ADD COLUMN user_id uuid NULL;

CREATE INDEX idx_promo_stores_user ON public.promo_stores(user_id);

DROP POLICY IF EXISTS "promo_stores: public read" ON public.promo_stores;
CREATE POLICY "promo_stores: visible read" ON public.promo_stores
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "promo_stores: own insert" ON public.promo_stores
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "promo_stores: own update" ON public.promo_stores
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 4. promo_products: allow user-created products (insert by self)
ALTER TABLE public.promo_products
  ADD COLUMN user_id uuid NULL;

CREATE POLICY "promo_products: own insert" ON public.promo_products
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "promo_products: own update" ON public.promo_products
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 5. promo_product_aliases: allow inserts (linked to user products)
CREATE POLICY "promo_product_aliases: insert" ON public.promo_product_aliases
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. Storage bucket for flyers (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('flyers', 'flyers', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "flyers bucket: own select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "flyers bucket: own insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "flyers bucket: own update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "flyers bucket: own delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);
