-- ============================================================
-- PLANO DE CONTAS GLOBAL + EQUIPE (master + membros com acesso
-- por financeiro) — 2026-11-24T18:20
--
-- IMPORTANTE (ordem correta): PRIMEIRO substituir o trigger de
-- segregação (senão o UPDATE de unificação falha com 23514),
-- DEPOIS unificar os dados.
-- ============================================================

-- ------------------------------------------------------------
-- 1) NOVO TRIGGER DE SEGREGAÇÃO: conta valida vínculo com o
--    financeiro; plano de contas é GLOBAL e não é mais validado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_segregacao_lancamento()
RETURNS trigger AS $$
DECLARE
  conta_fin_id UUID;
BEGIN
  -- A segregação patrimonial continua garantida pela CONTA:
  -- a conta precisa pertencer ao financeiro do lançamento.
  SELECT financeiro_id INTO conta_fin_id FROM public.contas WHERE id = NEW.conta_id;
  IF conta_fin_id IS NULL OR conta_fin_id <> NEW.financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: A conta bancária informada não pertence ao financeiro selecionado.'
      USING ERRCODE = '23514';
  END IF;
  -- Plano de contas é GLOBAL: qualquer categoria vale para qualquer financeiro.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 2) PLANO DE CONTAS GLOBAL: remover vínculo financeiro_id.
--    Antes do ALTER, derrubar trigger/policies que referenciam
--    a coluna (nenhum aqui, mas por segurança recriamos).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS auth_all_plano_contas ON public.plano_contas;

ALTER TABLE public.plano_contas
  ALTER COLUMN financeiro_id DROP NOT NULL,
  ALTER COLUMN financeiro_id DROP DEFAULT;

-- Constraint de unicidade por usuário+descrição criada só após
-- a deduplicação (no fim do arquivo).

-- ------------------------------------------------------------
-- 3) UNIFICAR CATEGORIAS DUPLICADAS entre financeiros do mesmo
--    usuário: mesma descrição (case/acento-insensível) => uma
--    canônica (a mais antiga), apontar dependentes, deletar.
-- ------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  canon UUID;
  dup UUID;
BEGIN
  FOR rec IN
    SELECT user_id, lower(trim(descricao)) AS desc_norm, min(id::text)::uuid AS canon_id,
           array_agg(id ORDER BY created_at, id) AS todos
    FROM public.plano_contas
    GROUP BY user_id, lower(trim(descricao))
    HAVING count(*) > 1
  LOOP
    canon := rec.canon_id;
    FOREACH dup IN ARRAY rec.todos LOOP
      CONTINUE WHEN dup = canon;
      UPDATE public.lancamentos SET plano_conta_id = canon WHERE plano_conta_id = dup;
      UPDATE public.budgets SET plano_conta_id = canon WHERE plano_conta_id = dup;
      UPDATE public.contas_fixas SET plano_conta_id = canon WHERE plano_conta_id = dup;
      UPDATE public.regras_conciliacao SET plano_conta_id = canon WHERE plano_conta_id = dup;
      UPDATE public.lancamentos_recorrentes SET plano_conta_id = canon WHERE plano_conta_id = dup;
      DELETE FROM public.plano_contas WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4) NULLIFICAR financeiro_id (coluna fica por compatibilidade
--    mas sem valor) e liberar a política RLS para o plano global.
-- ------------------------------------------------------------
UPDATE public.plano_contas SET financeiro_id = NULL;

-- Constraint de unicidade global por usuário + descrição normalizada
CREATE UNIQUE INDEX IF NOT EXISTS uniq_plano_contas_user_descnorm
  ON public.plano_contas (user_id, lower(trim(descricao)));

DROP POLICY IF EXISTS auth_all_plano_contas ON public.plano_contas;
CREATE POLICY auth_all_plano_contas ON public.plano_contas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) EQUIPE: tabela de membros (master + permissão de acesso)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipe_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financeiro_id UUID NOT NULL REFERENCES public.financeiros(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN ('master','membro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_user_id, financeiro_id)
);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_owner ON public.equipe_membros (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_member ON public.equipe_membros (member_user_id);

ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipe_membros_all ON public.equipe_membros;
CREATE POLICY equipe_membros_all ON public.equipe_membros
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id OR auth.uid() = member_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- ------------------------------------------------------------
-- 6) Helper: financeiros que o usuário logado pode acessar
--    (master = dono dos financeiros; membro = liberado em
--    equipe_membros). Usado nas telas e nas policies abaixo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_financeiro(p_financeiro_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.financeiros f
    WHERE f.id = p_financeiro_id AND f.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.equipe_membros em
    WHERE em.member_user_id = auth.uid()
      AND em.financeiro_id = p_financeiro_id
      AND em.owner_user_id = (SELECT f.user_id FROM public.financeiros f WHERE f.id = p_financeiro_id)
  )
$$;

-- ------------------------------------------------------------
-- 7) Policies de acesso por financeiro nas tabelas operacionais
--    (master vê tudo do próprio user_id; membro só os liberados).
--    Todas com fallback: usuário comum continua vendo pelo user_id.
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lancamentos','contas','contas_fixas','budgets','importacoes','extrato_itens','lancamentos_recorrentes','regras_conciliacao'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%I ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY auth_all_%I ON public.%I
        FOR ALL TO authenticated
        USING (
          user_id = auth.uid()
          OR public.usuario_pode_acessar_financeiro(financeiro_id)
        )
        WITH CHECK (
          user_id = auth.uid()
          OR public.usuario_pode_acessar_financeiro(financeiro_id)
        )
    $f$, t, t);
  END LOOP;

  -- Mútuos: as duas pontas precisam estar liberadas
  EXECUTE 'DROP POLICY IF EXISTS auth_all_mutuos ON public.mutuos';
  EXECUTE $f$
    CREATE POLICY auth_all_mutuos ON public.mutuos
      FOR ALL TO authenticated
      USING (
        user_id = auth.uid()
        OR (public.usuario_pode_acessar_financeiro(origem_financeiro_id)
            AND public.usuario_pode_acessar_financeiro(destino_financeiro_id))
      )
      WITH CHECK (
        user_id = auth.uid()
        OR (public.usuario_pode_acessar_financeiro(origem_financeiro_id)
            AND public.usuario_pode_acessar_financeiro(destino_financeiro_id))
      )
  $f$;
END $$;

-- Financeiros: dono vê os seus; membro vê os que lhe foram liberados
DROP POLICY IF EXISTS auth_all_financeiros ON public.financeiros;
CREATE POLICY auth_all_financeiros ON public.financeiros
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.equipe_membros em
      WHERE em.financeiro_id = financeiros.id AND em.member_user_id = auth.uid()
    )
  )
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 8) Seed: garantir que o usuário atual (dono) seja master de
--    tudo que já existe — nada a fazer, pois o dono é o user_id
--    das próprias tabelas. Nada a semear aqui.
-- ------------------------------------------------------------
