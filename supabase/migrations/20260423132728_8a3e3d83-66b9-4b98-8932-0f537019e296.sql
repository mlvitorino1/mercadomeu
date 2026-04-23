-- Tabela de cache para insights de IA
CREATE TABLE public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('forecast', 'stock')),
  input_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 1,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

CREATE INDEX idx_ai_insights_user_kind ON public.ai_insights(user_id, kind);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI insights: own select"
  ON public.ai_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "AI insights: own insert"
  ON public.ai_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "AI insights: own update"
  ON public.ai_insights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "AI insights: own delete"
  ON public.ai_insights FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at automático
CREATE TRIGGER trg_ai_insights_updated_at
  BEFORE UPDATE ON public.ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Função e triggers de invalidação ao mudar recibos/itens
CREATE OR REPLACE FUNCTION public.invalidate_ai_insights()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    _user_id := OLD.user_id;
  ELSE
    _user_id := NEW.user_id;
  END IF;

  DELETE FROM public.ai_insights WHERE user_id = _user_id;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_invalidate_ai_insights_receipts
  AFTER INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_ai_insights();

CREATE TRIGGER trg_invalidate_ai_insights_items
  AFTER INSERT OR UPDATE OR DELETE ON public.receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_ai_insights();