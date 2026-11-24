-- Policy do plano de contas global: membros da equipe também leem as
-- categorias do master (categorias não têm financeiro_id, então a
-- permissão vem do vínculo via financeiros/equipe_membros).
DROP POLICY IF EXISTS auth_all_plano_contas ON public.plano_contas;
CREATE POLICY auth_all_plano_contas ON public.plano_contas
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.financeiros f
      JOIN public.equipe_membros em
        ON em.financeiro_id = f.id AND em.member_user_id = auth.uid()
      WHERE f.user_id = plano_contas.user_id
    )
  )
  WITH CHECK (user_id = auth.uid());
