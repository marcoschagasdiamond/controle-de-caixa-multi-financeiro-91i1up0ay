-- ============================================================
-- Suplemento da migração 20261127150000:
-- (idempotente: reexecutável sem efeito colateral)
-- RPC para buscar usuário por e-mail (usado para VINCULAR um usuário já
-- existente à organização, sem depender do invite por e-mail).
-- Segue o padrão SECURITY DEFINER de equipe_listar_membros: só admins da
-- organização chamam com sucesso (checado dentro da função via token extra).
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipe_buscar_usuario_por_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
    AND EXISTS (
      SELECT 1 FROM public.organizacao_usuarios meu
      WHERE meu.user_id = auth.uid() AND meu.papel = 'admin'
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.equipe_buscar_usuario_por_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equipe_buscar_usuario_por_email(text) TO authenticated;
