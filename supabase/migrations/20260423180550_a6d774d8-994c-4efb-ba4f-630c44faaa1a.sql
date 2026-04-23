
DROP POLICY IF EXISTS "promo_product_aliases: insert" ON public.promo_product_aliases;

CREATE POLICY "promo_product_aliases: own insert" ON public.promo_product_aliases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.promo_products p
      WHERE p.id = promo_product_aliases.product_id
        AND p.user_id = auth.uid()
    )
  );
