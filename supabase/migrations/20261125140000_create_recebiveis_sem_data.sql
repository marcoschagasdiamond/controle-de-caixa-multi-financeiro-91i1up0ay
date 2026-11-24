-- Recebíveis sem data definida (contratos a receber):
-- recebível real cuja data de recebimento depende de gatilho externo
-- (ex.: despacho do governo, término do contrato). NÃO entra na projeção
-- de caixa: nenhuma tela de projeção consulta esta tabela. Quando a data
-- for definida, o usuário converte em lançamento previsto (a conversão
-- grava lancamento_id e status 'convertido', mantendo o histórico).
CREATE TABLE IF NOT EXISTS public.recebiveis_sem_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financeiro_id UUID NOT NULL REFERENCES public.financeiros(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total NUMERIC(14, 2) NOT NULL CHECK (valor_total >= 0),
  total_parcelas INTEGER, -- NULL = pagamento único
  contratante TEXT,
  status_gatilho TEXT NOT NULL DEFAULT 'aguardando_despacho'
    CHECK (status_gatilho IN ('aguardando_despacho', 'aguardando_termino', 'outro')),
  gatilho_outro TEXT,
  observacao TEXT,
  -- Categoria (plano de contas, global) opcional: na conversão o usuário pode ajustar
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'convertido')),
  lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recebiveis_sem_data_financeiro
  ON public.recebiveis_sem_data (financeiro_id);

ALTER TABLE public.recebiveis_sem_data ENABLE ROW LEVEL SECURITY;

-- Mesma regra de acesso por financeiro usada nas demais tabelas
-- (master = dono; membro = liberado em equipe_membros).
DROP POLICY IF EXISTS "auth_all_recebiveis_sem_data" ON public.recebiveis_sem_data;
CREATE POLICY "auth_all_recebiveis_sem_data" ON public.recebiveis_sem_data
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.usuario_pode_acessar_financeiro(financeiro_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.usuario_pode_acessar_financeiro(financeiro_id)
  );
