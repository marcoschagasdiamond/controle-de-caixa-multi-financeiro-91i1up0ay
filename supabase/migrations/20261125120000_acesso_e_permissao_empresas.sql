-- Acesso a empresas: unindo as três regras em usuario_pode_acessar_financeiro:
--   1. criou a empresa (user_id = auth.uid());
--   2. foi liberado pelo master (equipe_membros);
--   3. é o master da equipe à qual o dono da empresa pertence (master vê tudo).
-- E a nova permissão por membro "pode criar empresas" (padrão: false);
-- o master sempre pode criar.

-- 1) Coluna de permissão na equipe
ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS pode_criar_empresas boolean NOT NULL DEFAULT false;

-- 2) Regra única de acesso (usada pelas policies de todas as tabelas)
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_financeiro(p_financeiro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.financeiros f
    WHERE f.id = p_financeiro_id AND f.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.equipe_membros em
    WHERE em.member_user_id = auth.uid()
      AND em.financeiro_id = p_financeiro_id
      AND em.owner_user_id = (SELECT f.user_id FROM public.financeiros f WHERE f.id = p_financeiro_id)
  ) OR EXISTS (
    -- Master da equipe: vê toda empresa criada por membros da sua equipe
    SELECT 1
    FROM public.financeiros f
    JOIN public.equipe_membros em
      ON em.member_user_id = f.user_id
     AND em.owner_user_id = auth.uid()
    WHERE f.id = p_financeiro_id
  )
$function$;

-- 3) Policy de financeiros reescrita por comando, para permitir bloquear
--    INSERT de membro sem permissão sem afetar UPDATE/DELETE existentes.
DROP POLICY IF EXISTS auth_all_financeiros ON public.financeiros;

CREATE POLICY financeiros_select ON public.financeiros
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.usuario_pode_acessar_financeiro(id));

CREATE POLICY financeiros_update ON public.financeiros
  FOR UPDATE TO authenticated
  USING (public.usuario_pode_acessar_financeiro(id))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY financeiros_delete ON public.financeiros
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- INSERT: o dono é sempre o próprio usuário; membro de equipe só com a
-- permissão "pode criar empresas" (ou se já gerencia uma equipe = master).
CREATE POLICY financeiros_insert ON public.financeiros
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      NOT EXISTS (SELECT 1 FROM public.equipe_membros em WHERE em.member_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.equipe_membros em
        WHERE em.member_user_id = auth.uid() AND em.pode_criar_empresas
      )
      OR EXISTS (SELECT 1 FROM public.equipe_membros em WHERE em.owner_user_id = auth.uid())
    )
  );

-- 4) RPC da aba Equipe passa a expor a permissão por membro
DROP FUNCTION IF EXISTS public.equipe_listar_membros();
CREATE FUNCTION public.equipe_listar_membros()
RETURNS TABLE(member_user_id uuid, email text, nome text, financeiro_ids uuid[], pode_criar_empresas boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH alvo AS (
    -- Quem já tem vínculo em equipe_membros com o master logado
    SELECT em.member_user_id AS uid
    FROM public.equipe_membros em
    WHERE em.owner_user_id = auth.uid()
    UNION
    -- Quem o master convidou (edge function grava invited_by no metadata)
    -- e ainda não tem nenhum financeiro marcado
    SELECT u.id AS uid
    FROM auth.users u
    WHERE u.raw_user_meta_data->>'invited_by' = auth.uid()::text
  )
  SELECT
    a.uid,
    au.email::text,
    COALESCE(au.raw_user_meta_data->>'name', ''),
    COALESCE(
      (
        SELECT array_agg(em.financeiro_id ORDER BY em.financeiro_id)
        FROM public.equipe_membros em
        WHERE em.member_user_id = a.uid
          AND em.owner_user_id = auth.uid()
      ),
      ARRAY[]::uuid[]
    ),
    COALESCE(
      (
        SELECT bool_or(em.pode_criar_empresas)
        FROM public.equipe_membros em
        WHERE em.member_user_id = a.uid
          AND em.owner_user_id = auth.uid()
      ),
      false
    )
  FROM alvo a
  JOIN auth.users au ON au.id = a.uid;
END;
$function$;
