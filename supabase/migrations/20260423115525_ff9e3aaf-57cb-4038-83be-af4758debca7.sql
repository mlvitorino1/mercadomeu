-- household_profile: stores onboarding info used to personalize AI insights
CREATE TABLE IF NOT EXISTS public.household_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Composição familiar
  adults INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 0 AND adults <= 20),
  children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0 AND children <= 20),
  pets INTEGER NOT NULL DEFAULT 0 CHECK (pets >= 0 AND pets <= 20),
  -- Renda e orçamento (faixas/valores opcionais)
  income_range TEXT,                -- e.g. 'até 2k', '2k-5k', '5k-10k', '10k+'
  monthly_grocery_budget NUMERIC(10,2),
  -- Restrições e preferências
  restrictions TEXT[] NOT NULL DEFAULT '{}',  -- e.g. ['vegetariano','sem_lactose']
  favorite_brands TEXT[] NOT NULL DEFAULT '{}',
  favorite_stores TEXT[] NOT NULL DEFAULT '{}',
  -- Hábitos
  shopping_frequency TEXT,          -- 'semanal' | 'quinzenal' | 'mensal' | 'esporadica'
  preferred_shopping_day TEXT,      -- e.g. 'sabado'
  preferred_payment_method TEXT,    -- e.g. 'pix','credito','debito','dinheiro'
  -- Estado
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household: own select"
  ON public.household_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Household: own insert"
  ON public.household_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Household: own update"
  ON public.household_profile FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_household_profile_updated
  BEFORE UPDATE ON public.household_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();