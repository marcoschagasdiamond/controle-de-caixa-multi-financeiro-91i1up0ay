-- =====================================================================
-- Plano de contas GLOBAL + tabelas de equipe (base para próxima rodada)
-- Substitui as migrações 20261124140000 e 20261124140001 (nunca aplicadas).
-- ORDEM CRÍTICA: 1) corrigir a função do trigger (validação do plano é
-- removida), 2) só depois unificar os dados — evita o erro 23514 do
-- trigger validar_segregacao_lancamento durante os UPDATEs.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. TRIGGER: valida apenas a CONTA (o plano de contas agora é global)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_segregacao_lancamento()
RETURNS trigger AS $$
DECLARE
  conta_fin_id UUID;
BEGIN
  -- Validar se a conta pertence ao mesmo financeiro (continua OBRIGATÓRIO)
  SELECT financeiro_id INTO conta_fin_id FROM public.contas WHERE id = NEW.conta_id;
  IF conta_fin_id IS NULL OR conta_fin_id <> NEW.financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: A conta bancária informada não pertence ao financeiro selecionado.'
      USING ERRCODE = '23514';
  END IF;

  -- Plano de contas é GLOBAL: não há mais validação de financeiro para o plano.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- 2. Unificação de dados: elimina categorias duplicadas entre financeiros
--    (mesma descrição normalizada; codigo entra no agrupamento quando
--    existe nos dois lados). Canônica = a mais antiga.
-- ---------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  canonic uuid;
  alvo_ids uuid[];
BEGIN
  FOR rec IN
    SELECT lower(trim(descricao)) AS descr,
           min(lower(trim(codigo))) FILTER (WHERE lower(trim(codigo)) <> '') AS cod,
           bool_or(lower(trim(codigo)) = '') AS tem_sem_codigo
    FROM public.plano_contas
    GROUP BY lower(trim(descricao))
    HAVING count(*) > 1
  LOOP
    -- Canônica: a mais antiga; se o grupo mistura com/sem codigo, prefere
    -- a que TEM codigo (mais completa), ainda assim a mais antiga dela.
    SELECT id INTO canonic
    FROM public.plano_contas
    WHERE lower(trim(descricao)) = rec.descr
      AND (NOT rec.tem_sem_codigo OR lower(trim(codigo)) <> '' OR true)
    ORDER BY
      CASE WHEN lower(trim(codigo)) <> '' THEN 0 ELSE 1 END ASC,
      created_at ASC,
      id ASC
    LIMIT 1;

    SELECT array_agg(id) INTO alvo_ids
    FROM public.plano_contas
    WHERE lower(trim(descricao)) = rec.descr AND id <> canonic;

    UPDATE public.lancamentos             SET plano_conta_id = canonic WHERE plano_conta_id = ANY(alvo_ids);
    UPDATE public.lancamentos_recorrentes SET plano_conta_id = canonic WHERE plano_conta_id = ANY(alvo_ids);
    UPDATE public.contas_fixas            SET plano_conta_id = canonic WHERE plano_conta_id = ANY(alvo_ids);
    UPDATE public.regras_conciliacao      SET plano_conta_id = canonic WHERE plano_conta_id = ANY(alvo_ids);
    UPDATE public.budgets                 SET plano_conta_id = canonic
      WHERE plano_conta_id = ANY(alvo_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.budgets b2
        WHERE b2.financeiro_id = budgets.financeiro_id
          AND b2.mes_ano = budgets.mes_ano
          AND b2.plano_conta_id = canonic
          AND b2.id <> budgets.id
      );
    -- Se já existia budget da canônica para o mesmo mês/financeiro, apaga a duplicada
    DELETE FROM public.budgets
      WHERE plano_conta_id = ANY(alvo_ids);

    DELETE FROM public.plano_contas WHERE id = ANY(alvo_ids);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 3. financeiro_id de plano_contas deixa de ser obrigatório
--    (coluna mantida nesta rodada para minimizar quebra)
-- ---------------------------------------------------------------
ALTER TABLE public.plano_contas ALTER COLUMN financeiro_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plano_contas_descricao_norm
  ON public.plano_contas(lower(trim(descricao)));

-- ---------------------------------------------------------------
-- 4. TABELAS DA EQUIPE (base; UI/edge function ficam para a próxima rodada)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipe_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (master_user_id, email)
);

CREATE TABLE IF NOT EXISTS public.equipe_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  financeiro_id uuid NOT NULL REFERENCES public.financeiros(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membro_id, financeiro_id)
);

CREATE INDEX IF NOT EXISTS idx_equipe_membros_master ON public.equipe_membros(master_user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_user ON public.equipe_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_acessos_membro ON public.equipe_acessos(membro_id);

ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipe_membros_master_all" ON public.equipe_membros;
CREATE POLICY "equipe_membros_master_all" ON public.equipe_membros
  FOR ALL TO authenticated
  USING (master_user_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (master_user_id = auth.uid());

DROP POLICY IF EXISTS "equipe_acessos_master_all" ON public.equipe_acessos;
CREATE POLICY "equipe_acessos_master_all" ON public.equipe_acessos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.equipe_membros em
      WHERE em.id = equipe_acessos.membro_id
        AND (em.master_user_id = auth.uid() OR em.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equipe_membros em
      WHERE em.id = equipe_acessos.membro_id
        AND em.master_user_id = auth.uid()
    )
  );
