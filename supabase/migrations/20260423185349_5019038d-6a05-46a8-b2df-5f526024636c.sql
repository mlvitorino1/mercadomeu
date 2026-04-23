ALTER TABLE public.promo_flyers
  ADD COLUMN IF NOT EXISTS storage_paths text[] NOT NULL DEFAULT '{}';