-- ============================================================
-- TELAS DE GESTÃO DA ORGANIZAÇÃO (v0.0.70)
-- Apenas o que falta para as telas lerem/gravarem com RLS ativo:
--   1) financeiros.classificacao: 'propria' | 'cliente'
--      (empresa da própria organização x empresa de cliente do escritório)
--   2) RPC organizacao_listar_usuarios: lista os vínculos da organização
--      COM o e-mail de cada usuário (auth.users não é legível via PostgREST;
--      padrão já usado por equipe_listar_membros).
--   3) Atualiza a tipagem manual do cliente (src/lib/supabase/types.ts).
-- RLS existente de organizacoes/organizacao_usuarios/financeiros intocado —
-- as políticas (e_admin_organizacao / pertence_organizacao) já cobrem tudo.
-- ============================================================

-- 1) Classificação do financeiro dentro da organização ----------------------
ALTER TABLE public.financeiros
  ADD COLUMN IF NOT EXISTS classificacao text
  DEFAULT 'propria'
  CHECK (classificacao = ANY (ARRAY['propria'::text, 'cliente'::text]));

COMMENT ON COLUMN public.financeiros.classificacao IS
  'Dentro da organização: propria = empresa da própria organização; cliente = empresa de cliente (caso escritório contábil)';

-- 2) RPC: vínculos da organização com e-mail do usuário ---------------------
CREATE OR REPLACE FUNCTION public.organizacao_listar_usuarios(p_organizacao_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  nome text,
  papel text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    ou.user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'name', '') AS nome,
    ou.papel,
    ou.created_at
  FROM public.organizacao_usuarios ou
  JOIN auth.users u ON u.id = ou.user_id
  WHERE ou.organizacao_id = p_organizacao_id
    AND public.e_admin_organizacao(p_organizacao_id)
  ORDER BY CASE ou.papel WHEN 'admin' THEN 0 ELSE 1 END, u.email
$function$;

REVOKE ALL ON FUNCTION public.organizacao_listar_usuarios(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizacao_listar_usuarios(uuid) TO authenticated;
