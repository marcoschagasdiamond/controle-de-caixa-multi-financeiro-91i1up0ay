-- RPC para a aba Equipe (master): lista TODOS os membros/convidados do
-- master logado — tanto quem já tem vínculo em equipe_membros quanto quem
-- foi convidado (edge function convidar-usuario grava invited_by no
-- raw_user_meta_data do auth.users) e ainda não tem financeiro marcado.
-- Traz o e-mail de cada um (resolve a coluna de e-mails vazia).
-- SECURITY DEFINER porque precisa ler auth.users e contornar o RLS de
-- equipe_membros; a própria função restringe tudo ao auth.uid() atual.

CREATE OR REPLACE FUNCTION public.equipe_listar_membros()
RETURNS TABLE (member_user_id uuid, email text, nome text, financeiro_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    )
  FROM alvo a
  JOIN auth.users au ON au.id = a.uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.equipe_listar_membros() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.equipe_listar_membros() TO authenticated;
