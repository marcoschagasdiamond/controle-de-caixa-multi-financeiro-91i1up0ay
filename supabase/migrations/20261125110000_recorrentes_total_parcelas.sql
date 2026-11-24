-- Parcelamento em recorrentes: total_parcelas opcional (NULL = mensal contínua, como hoje)
ALTER TABLE public.lancamentos_recorrentes
  ADD COLUMN IF NOT EXISTS total_parcelas INTEGER;

ALTER TABLE public.lancamentos_recorrentes
  ADD CONSTRAINT total_parcelas_positiva CHECK (total_parcelas IS NULL OR total_parcelas >= 1);
