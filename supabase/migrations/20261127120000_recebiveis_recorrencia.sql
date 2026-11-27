-- Recebíveis sem data: recorrência mensal por N ocorrências.
-- Uma ocorrência por mês, cada uma com sua data_prevista, todas alimentando os
-- Alertas de vencimento do Painel. Receber/converter marca SÓ a ocorrência.
CREATE TABLE IF NOT EXISTS public.recebiveis_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recebivel_pai_id uuid NOT NULL REFERENCES public.recebiveis_sem_data(id) ON DELETE CASCADE,
  financeiro_id uuid NOT NULL REFERENCES public.financeiros(id) ON DELETE CASCADE,
  numero integer NOT NULL, -- 1 = 1ª ocorrência (a própria), 2..N = seguintes (+1 mês)
  data_prevista date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','convertido')),
  lancamento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recebiveis_ocorrencias ENABLE ROW LEVEL SECURITY;

-- Mesma regra de acesso dos recebíveis: dono do financeiro ou membro liberado.
CREATE POLICY recebiveis_ocorrencias_select ON public.recebiveis_ocorrencias
  FOR SELECT USING (
    public.usuario_pode_acessar_financeiro(financeiro_id)
  );
CREATE POLICY recebiveis_ocorrencias_insert ON public.recebiveis_ocorrencias
  FOR INSERT WITH CHECK (
    public.usuario_pode_acessar_financeiro(financeiro_id)
    AND user_id = auth.uid()
  );
CREATE POLICY recebiveis_ocorrencias_update ON public.recebiveis_ocorrencias
  FOR UPDATE USING (
    public.usuario_pode_acessar_financeiro(financeiro_id)
  );
CREATE POLICY recebiveis_ocorrencias_delete ON public.recebiveis_ocorrencias
  FOR DELETE USING (
    public.usuario_pode_acessar_financeiro(financeiro_id)
  );

CREATE INDEX IF NOT EXISTS idx_recebiveis_ocorrencias_pai
  ON public.recebiveis_ocorrencias(recebivel_pai_id);
CREATE INDEX IF NOT EXISTS idx_recebiveis_ocorrencias_financeiro
  ON public.recebiveis_ocorrencias(financeiro_id);
