-- ============================================================
-- RPC mover_categoria_para_grupo: move uma categoria do plano
-- de contas para outro grupo REAL (grupos_plano_contas).
--
-- SECURITY DEFINER para contornar a política RLS de UPDATE do
-- plano_contas (o membro da equipe lê os grupos do master mas
-- não pode atualizá-los; aqui o grupo e a categoria pertencem
-- ao mesmo dono e a mudança é atômica).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mover_categoria_para_grupo(
  p_plano_conta_id UUID,
  p_grupo_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_tipo TEXT;
  v_grupo_user UUID;
  v_grupo_tipo TEXT;
BEGIN
  -- Categoria atual
  SELECT user_id, tipo INTO v_user, v_tipo
  FROM public.plano_contas WHERE id = p_plano_conta_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Categoria não encontrada';
  END IF;

  -- Usuário precisa ser dono (ou membro da equipe do dono)
  IF v_user <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.financeiros f
      JOIN public.equipe_membros em ON em.financeiro_id = f.id
      WHERE f.user_id = v_user AND em.member_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Sem permissão para mover esta categoria';
    END IF;
  END IF;

  -- Grupo nulo: categoria fica sem grupo (não é mais permitido —
  -- o grupo é obrigatório). Rejeita.
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'Categoria deve pertencer a um grupo';
  END IF;

  -- Grupo precisa existir, pertencer ao MESMO dono e ter o MESMO tipo
  SELECT user_id, tipo INTO v_grupo_user, v_grupo_tipo
  FROM public.grupos_plano_contas WHERE id = p_grupo_id;
  IF v_grupo_user IS NULL THEN
    RAISE EXCEPTION 'Grupo não encontrado';
  END IF;
  IF v_grupo_user <> v_user THEN
    RAISE EXCEPTION 'Grupo pertence a outro usuário';
  END IF;
  IF v_grupo_tipo <> v_tipo THEN
    RAISE EXCEPTION 'Grupo é de %, categoria é de %', v_grupo_tipo, v_tipo;
  END IF;

  UPDATE public.plano_contas
  SET grupo_id = p_grupo_id
  WHERE id = p_plano_conta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mover_categoria_para_grupo(UUID, UUID) TO authenticated;

-- Versão em lote para mover vários de uma vez
CREATE OR REPLACE FUNCTION public.mover_categorias_para_grupo(
  p_plano_conta_ids UUID[],
  p_grupo_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_movidos INTEGER := 0;
BEGIN
  FOREACH v_id IN ARRAY p_plano_conta_ids LOOP
    PERFORM public.mover_categoria_para_grupo(v_id, p_grupo_id);
    v_movidos := v_movidos + 1;
  END LOOP;
  RETURN v_movidos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mover_categorias_para_grupo(UUID[], UUID) TO authenticated;
