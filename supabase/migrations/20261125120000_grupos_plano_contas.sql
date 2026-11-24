-- ============================================================
-- GRUPOS HIERÁRQUICOS REAIS do Plano de Contas
--
-- Até aqui o "grupo" era apenas deduzido do prefixo do código
-- (ex.: 2.09.x = Saúde). Agora grupos são linhas reais em
-- grupos_plano_contas e cada categoria aponta para o grupo via
-- plano_contas.grupo_id — o usuário pode mover categorias entre
-- grupos livremente, sem depender do prefixo do código.
--
-- Compatibilidade: nenhuma coluna é removida; lançamentos,
-- recorrentes, fixas, regras e budgets continuam apontando para
-- plano_contas (agora com ON DELETE CASCADE, um grupo excluído
-- com todas as suas categorias leva junto os vínculos).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de grupos (1 nível, agrupa categorias do mesmo tipo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupos_plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grupos_plano_user ON public.grupos_plano_contas(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_grupos_plano_user_nome
  ON public.grupos_plano_contas (user_id, lower(trim(nome)), tipo);

ALTER TABLE public.grupos_plano_contas ENABLE ROW LEVEL SECURITY;

-- Mesma regra de leitura do plano de contas: dono vê tudo; membro
-- da equipe lê as categorias/grupos do master (vínculo via financeiros).
DROP POLICY IF EXISTS auth_all_grupos_plano_contas ON public.grupos_plano_contas;
CREATE POLICY auth_all_grupos_plano_contas ON public.grupos_plano_contas
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.financeiros f
      JOIN public.equipe_membros em
        ON em.financeiro_id = f.id AND em.member_user_id = auth.uid()
      WHERE f.user_id = grupos_plano_contas.user_id
    )
  )
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) plano_contas.grupo_id
-- ------------------------------------------------------------
ALTER TABLE public.plano_contas
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES public.grupos_plano_contas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_plano_contas_grupo ON public.plano_contas(grupo_id);

-- ------------------------------------------------------------
-- 3) Backfill: cria grupos a partir dos prefixos de código já em
--    uso (2.09.01 → grupo "2.09") e vincula cada categoria ao seu
--    grupo. Nome do grupo = maior palavra em comum entre as
--    descrições das categorias do mesmo segmento (2 casas).
--    Categorias sem segmento (ex.: 1.03, 2.06) vão para o grupo
--    "Geral" do seu tipo — sobra nenhuma: tudo fica em algum grupo.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_dono RECORD;
  v_seg RECORD;
  v_cat RECORD;
  v_grupo_nome TEXT;
  v_grupo_id UUID;
  v_prefixo TEXT;
  v_maior_palavra TEXT;
  v_maior_qtd INT;
  v_geral_uuid UUID;
BEGIN
  FOR v_dono IN SELECT DISTINCT user_id FROM public.plano_contas LOOP
    -- Grupo "Geral" por tipo: recebe categorias sem grupo após o backfill
    FOR v_seg IN SELECT unnest(ARRAY['receita', 'despesa']) AS tipo LOOP
      SELECT id INTO v_geral_uuid FROM public.grupos_plano_contas
      WHERE user_id = v_dono.user_id AND lower(trim(nome)) = 'geral' AND tipo = v_seg.tipo
      LIMIT 1;
      IF v_geral_uuid IS NULL THEN
        INSERT INTO public.grupos_plano_contas (user_id, nome, tipo, ordem)
        VALUES (v_dono.user_id, 'Geral', v_seg.tipo, 999)
        RETURNING id INTO v_geral_uuid;
      END IF;
    END LOOP;

    -- Um grupo por segmento de código (2 casas: "2.09") que tenha
    -- ao menos UMA categoria com subsegmento (3 casas).
    FOR v_seg IN
      SELECT split_part(codigo, '.', 1) || '.' || split_part(codigo, '.', 2) AS segmento,
             min(tipo) AS tipo
      FROM public.plano_contas
      WHERE user_id = v_dono.user_id
        AND split_part(codigo, '.', 3) <> ''
      GROUP BY 1
    LOOP
      v_prefixo := v_seg.segmento;
      v_grupo_nome := v_prefixo;

      -- Nome legível: usa a maior palavra em comum entre as descrições
      -- das categorias do segmento (ex.: "Plano de Saúde", "Exames" e
      -- "Consultas Médicas" não têm palavra comum — fica o código).
      SELECT p.palavra, max(p.qtd) INTO v_maior_palavra, v_maior_qtd
      FROM (
        SELECT lower(unnest(regexp_split_to_array(descricao, '[^A-Za-zÀ-ÿ]+'))) AS palavra,
               count(*) AS qtd
        FROM public.plano_contas
        WHERE user_id = v_dono.user_id
          AND split_part(codigo, '.', 1) || '.' || split_part(codigo, '.', 2) = v_prefixo
        GROUP BY 1
      ) p
      WHERE length(p.palavra) > 3
      GROUP BY p.palavra
      ORDER BY max(p.qtd) DESC, max(length(p.palavra)) DESC
      LIMIT 1;

      IF v_maior_palavra IS NOT NULL AND v_maior_qtd > 1 THEN
        v_grupo_nome := initcap(v_maior_palavra);
      END IF;

      SELECT id INTO v_grupo_id FROM public.grupos_plano_contas
      WHERE user_id = v_dono.user_id
        AND lower(trim(nome)) = lower(trim(v_grupo_nome)) AND tipo = v_seg.tipo
      LIMIT 1;
      IF v_grupo_id IS NULL THEN
        INSERT INTO public.grupos_plano_contas (user_id, nome, tipo, ordem)
        VALUES (v_dono.user_id, v_grupo_nome, v_seg.tipo, 0)
        RETURNING id INTO v_grupo_id;
      END IF;

      UPDATE public.plano_contas
      SET grupo_id = v_grupo_id
      WHERE user_id = v_dono.user_id
        AND split_part(codigo, '.', 1) || '.' || split_part(codigo, '.', 2) = v_prefixo;
    END LOOP;

    -- Categorias que ficaram sem grupo: vai para o "Geral" do seu tipo
    FOR v_cat IN
      SELECT id, tipo FROM public.plano_contas
      WHERE user_id = v_dono.user_id AND grupo_id IS NULL
    LOOP
      SELECT id INTO v_grupo_id FROM public.grupos_plano_contas
      WHERE user_id = v_dono.user_id AND lower(trim(nome)) = 'geral' AND tipo = v_cat.tipo
      LIMIT 1;
      UPDATE public.plano_contas SET grupo_id = v_grupo_id WHERE id = v_cat.id;
    END LOOP;
  END LOOP;
END $$;

-- Grupo passa a ser obrigatório: toda categoria vive em algum grupo.
-- (Só roda se o backfill não deixou órfãs.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.plano_contas WHERE grupo_id IS NULL) THEN
    RAISE NOTICE 'plano_contas com grupo_id nulo após backfill: constraint NOT NULL não aplicada';
  ELSE
    ALTER TABLE public.plano_contas ALTER COLUMN grupo_id SET NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) FKs de plano_contas: grupo/relações passam a CASCADE para que
--    excluir um grupo (com todas as categorias) também exclua os
--    vínculos dependentes — evita órfãos ao remover grupos.
--    (budgets e lancamentos_recorrentes já eram CASCADE)
-- ------------------------------------------------------------
ALTER TABLE public.contas_fixas
  DROP CONSTRAINT IF EXISTS contas_fixas_plano_conta_id_fkey;
ALTER TABLE public.contas_fixas
  ADD CONSTRAINT contas_fixas_plano_conta_id_fkey
  FOREIGN KEY (plano_conta_id) REFERENCES public.plano_contas(id) ON DELETE CASCADE;

ALTER TABLE public.regras_conciliacao
  DROP CONSTRAINT IF EXISTS regras_conciliacao_plano_conta_id_fkey;
ALTER TABLE public.regras_conciliacao
  ADD CONSTRAINT regras_conciliacao_plano_conta_id_fkey
  FOREIGN KEY (plano_conta_id) REFERENCES public.plano_contas(id) ON DELETE CASCADE;
