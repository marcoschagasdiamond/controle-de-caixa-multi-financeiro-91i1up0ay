-- ============================================================
-- FUNDAÇÃO MULTI-EMPRESA (Tenancy por Organização)
-- Estrutura de dados apenas — sem alterar telas ou RLS existente.
--   - organizacoes: a organização (dono de empresa OU escritório contábil)
--   - organizacao_usuarios: vínculo usuário ↔ organização (admin/membro)
--   - financeiros.organizacao_id: o "financeiro" (empresa) passa a pertencer
--     a uma organização (no escritório, = empresa do cliente)
-- Compatibilidade: nenhuma política existente é alterada ou removida;
-- usuario_pode_acessar_financeiro continua valendo como está.
-- ============================================================

-- 1) Tabela de organizações -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text CHECK (tipo = ANY (ARRAY['empresa'::text, 'escritorio'::text])),
  criada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Vínculo usuário ↔ organização ---------------------------------------
CREATE TABLE IF NOT EXISTS public.organizacao_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'membro'
    CHECK (papel = ANY (ARRAY['admin'::text, 'membro'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organizacao_usuarios_user
  ON public.organizacao_usuarios (user_id);
CREATE INDEX IF NOT EXISTS idx_organizacao_usuarios_org
  ON public.organizacao_usuarios (organizacao_id);

-- 3) Financeiro pertence a uma organização (nullable — nada quebra) ------
ALTER TABLE public.financeiros
  ADD COLUMN IF NOT EXISTS organizacao_id uuid
  REFERENCES public.organizacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financeiros_organizacao
  ON public.financeiros (organizacao_id);

-- 4) Funções helper (SECURITY DEFINER) — evitam recursão entre policies ---
CREATE OR REPLACE FUNCTION public.e_admin_organizacao(p_organizacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organizacoes o
    WHERE o.id = p_organizacao_id AND o.criada_por = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.organizacao_usuarios ou
    WHERE ou.organizacao_id = p_organizacao_id
      AND ou.user_id = auth.uid()
      AND ou.papel = 'admin'
  )
$function$;

CREATE OR REPLACE FUNCTION public.pertence_organizacao(p_organizacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organizacao_usuarios ou
    WHERE ou.organizacao_id = p_organizacao_id
      AND ou.user_id = auth.uid()
  )
$function$;

-- 5) RLS: organizacoes ----------------------------------------------------
ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizacoes_select" ON public.organizacoes;
CREATE POLICY "organizacoes_select" ON public.organizacoes
  FOR SELECT TO authenticated
  USING (criada_por = auth.uid() OR public.pertence_organizacao(id));

DROP POLICY IF EXISTS "organizacoes_insert" ON public.organizacoes;
CREATE POLICY "organizacoes_insert" ON public.organizacoes
  FOR INSERT TO authenticated
  WITH CHECK (criada_por = auth.uid());

DROP POLICY IF EXISTS "organizacoes_update" ON public.organizacoes;
CREATE POLICY "organizacoes_update" ON public.organizacoes
  FOR UPDATE TO authenticated
  USING (public.e_admin_organizacao(id))
  WITH CHECK (public.e_admin_organizacao(id));

DROP POLICY IF EXISTS "organizacoes_delete" ON public.organizacoes;
CREATE POLICY "organizacoes_delete" ON public.organizacoes
  FOR DELETE TO authenticated
  USING (criada_por = auth.uid());

-- 6) RLS: organizacao_usuarios -------------------------------------------
ALTER TABLE public.organizacao_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizacao_usuarios_select" ON public.organizacao_usuarios;
CREATE POLICY "organizacao_usuarios_select" ON public.organizacao_usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.e_admin_organizacao(organizacao_id)
  );

DROP POLICY IF EXISTS "organizacao_usuarios_insert" ON public.organizacao_usuarios;
CREATE POLICY "organizacao_usuarios_insert" ON public.organizacao_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.e_admin_organizacao(organizacao_id));

DROP POLICY IF EXISTS "organizacao_usuarios_update" ON public.organizacao_usuarios;
CREATE POLICY "organizacao_usuarios_update" ON public.organizacao_usuarios
  FOR UPDATE TO authenticated
  USING (public.e_admin_organizacao(organizacao_id))
  WITH CHECK (public.e_admin_organizacao(organizacao_id));

DROP POLICY IF EXISTS "organizacao_usuarios_delete" ON public.organizacao_usuarios;
CREATE POLICY "organizacao_usuarios_delete" ON public.organizacao_usuarios
  FOR DELETE TO authenticated
  USING (public.e_admin_organizacao(organizacao_id));

-- 6b) RLS adicional em financeiros: admin da organização lê todos os
-- financeiros da sua organização. Política ADICIONAL (permissivas se
-- combinam com OR): as políticas existentes (dono + equipe) permanecem
-- intactas — o membro da equipe continua vendo somente o que foi liberado.
DROP POLICY IF EXISTS "financeiros_select_organizacao" ON public.financeiros;
CREATE POLICY "financeiros_select_organizacao" ON public.financeiros
  FOR SELECT TO authenticated
  USING (
    organizacao_id IS NOT NULL
    AND public.e_admin_organizacao(organizacao_id)
  );

-- 7) Trigger: criador da organização entra automaticamente como admin ----
CREATE OR REPLACE FUNCTION public.handle_nova_organizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.organizacao_usuarios (organizacao_id, user_id, papel)
  VALUES (NEW.id, NEW.criada_por, 'admin')
  ON CONFLICT (organizacao_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_organizacao_criada ON public.organizacoes;
CREATE TRIGGER on_organizacao_criada
  AFTER INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_nova_organizacao();

-- 8) Migração de dados existentes ----------------------------------------
-- Para cada usuário que possui financeiros sem organização:
--   - garante uma organização padrão (uma por usuário);
--   - atribui organizacao_id a todos os seus financeiros;
--   - víncula o usuário como admin e os membros da sua equipe como 'membro'.
-- Idempotente: rodar novamente não duplica nem move nada.
DO $$
DECLARE
  uid uuid;
  oid uuid;
  v_nome text;
BEGIN
  FOR uid IN
    SELECT DISTINCT f.user_id FROM public.financeiros f
    WHERE f.organizacao_id IS NULL
  LOOP
    -- organização existente do usuário ou nova
    SELECT o.id INTO oid
    FROM public.organizacoes o
    WHERE o.criada_por = uid
    LIMIT 1;

    IF oid IS NULL THEN
      SELECT COALESCE(
        (SELECT u.raw_user_meta_data->>'name' FROM auth.users u WHERE u.id = uid),
        'Organização Principal'
      ) INTO v_nome;

      INSERT INTO public.organizacoes (nome, tipo, criada_por)
      VALUES (v_nome, 'empresa', uid)
      RETURNING id INTO oid;
    END IF;

    -- atribui os financeiros do usuário à organização
    UPDATE public.financeiros
    SET organizacao_id = oid
    WHERE user_id = uid AND organizacao_id IS NULL;

    -- criador como admin (trigger já faz; idempotente)
    INSERT INTO public.organizacao_usuarios (organizacao_id, user_id, papel)
    VALUES (oid, uid, 'admin')
    ON CONFLICT (organizacao_id, user_id) DO NOTHING;

    -- membros da equipe do usuário entram na organização como 'membro'
    INSERT INTO public.organizacao_usuarios (organizacao_id, user_id, papel)
    SELECT DISTINCT oid, em.member_user_id, 'membro'
    FROM public.equipe_membros em
    WHERE em.owner_user_id = uid
    ON CONFLICT (organizacao_id, user_id) DO NOTHING;
  END LOOP;
END $$;
