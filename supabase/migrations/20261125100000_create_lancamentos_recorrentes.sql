-- Lançamentos recorrentes mensais: programação de ocorrências futuras (não é o pagamento real)
CREATE TABLE IF NOT EXISTS public.lancamentos_recorrentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financeiro_id UUID NOT NULL REFERENCES public.financeiros(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  plano_conta_id UUID NOT NULL REFERENCES public.plano_contas(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(14, 2) NOT NULL CHECK (valor >= 0),
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  status TEXT NOT NULL DEFAULT 'previsto' CHECK (status = 'previsto'),
  dia_mes INTEGER NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  data_inicial DATE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_recorrentes_financeiro
  ON public.lancamentos_recorrentes (financeiro_id);

ALTER TABLE public.lancamentos_recorrentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_lancamentos_recorrentes" ON public.lancamentos_recorrentes;
CREATE POLICY "auth_all_lancamentos_recorrentes" ON public.lancamentos_recorrentes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
