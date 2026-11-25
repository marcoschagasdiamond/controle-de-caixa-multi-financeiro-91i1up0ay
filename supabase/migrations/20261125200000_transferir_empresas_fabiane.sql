-- Correção de dados: as empresas criadas pela Fabiane (fabiane.z@dgroup.com.br)
-- CONSULT PLAN LTDA e LANDCAR VEÍCULOS LTDA passam ao master
-- (marcoschagasdiamond@icloud.com), mantendo o acesso dela via equipe_membros
-- (ela continua vendo as duas pelas policies de SELECT de todas as tabelas).
-- Idempotente: só atualiza o que ainda aponta para Fabiane.

DO $$
DECLARE
  v_master uuid;
  v_fabiane uuid;
BEGIN
  SELECT id INTO v_master FROM auth.users WHERE email = 'marcoschagasdiamond@icloud.com';
  SELECT id INTO v_fabiane FROM auth.users WHERE email = 'fabiane.z@dgroup.com.br';

  IF v_master IS NULL OR v_fabiane IS NULL THEN
    RAISE NOTICE 'usuários não encontrados, nada feito';
    RETURN;
  END IF;

  UPDATE public.financeiros
    SET user_id = v_master, updated_at = now()
    WHERE user_id = v_fabiane
      AND nome IN ('CONSULT PLAN LTDA', 'LANDCAR VEÍCULOS LTDA');

  INSERT INTO public.equipe_membros (owner_user_id, member_user_id, financeiro_id, papel, pode_criar_empresas)
  SELECT v_master, v_fabiane, f.id, 'membro', false
    FROM public.financeiros f
    WHERE f.user_id = v_master
      AND f.nome IN ('CONSULT PLAN LTDA', 'LANDCAR VEÍCULOS LTDA')
  ON CONFLICT (member_user_id, financeiro_id) DO NOTHING;
END $$;
