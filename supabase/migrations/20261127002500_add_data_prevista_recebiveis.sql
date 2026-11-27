-- Data prevista de recebimento dos recebíveis sem data (contratos a receber).
-- Opcional: quando informada, alimenta os Alertas de vencimento do Painel.
ALTER TABLE public.recebiveis_sem_data
  ADD COLUMN IF NOT EXISTS data_prevista date;
