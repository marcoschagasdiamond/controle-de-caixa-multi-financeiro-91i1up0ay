import { supabase } from '@/lib/supabase/client'
import { EquipeMembroAcesso, Financeiro, MembroEquipeView } from '@/types/financeiro'

/**
 * EquipeService — gestão da equipe pelo master (dono dos financeiros).
 * Convite direto: e-mail + senha temporária, via edge function
 * 'convidar-usuario' (Admin API com service_role).
 * Permissões: equipe_membros (member_user_id + financeiro_id).
 */
export const EquipeService = {
  // Lista financeiros do usuário logado (master) para os checkboxes.
  async getFinanceiros(): Promise<Financeiro[]> {
    const { data, error } = await supabase
      .from('financeiros')
      .select('*')
      .order('nome', { ascending: true })
    if (error) throw error
    return (data as Financeiro[]) || []
  },

  // Cria login (edge function Admin API, sem envio de e-mail).
  async convidarUsuario(
    email: string,
    senhaTemporaria: string,
  ): Promise<{ id?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('convidar-usuario', {
      body: { email, senhaTemporaria },
    })
    if (error) return { error: error.message }
    return data as { user?: { id?: string; email?: string }; error?: string }
  },

  // Lista membros (user_ids distintos liberados pelo master) com e-mails.
  async getMembros(): Promise<MembroEquipeView[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    // RPC equipe_listar_membros (SECURITY DEFINER): traz vinculados (equipe_membros)
    // E convidados do master que ainda não têm financeiro marcado (invited_by
    // gravado no raw_user_meta_data pela edge function convidar-usuario),
    // já com o e-mail de cada um.
    const { data, error } = await (supabase as any).rpc('equipe_listar_membros')
    if (error) throw error

    return (
      (data as {
        member_user_id: string
        email: string
        nome: string
        financeiro_ids: string[]
      }[]) || []
    ).map((r) => ({
      member_user_id: r.member_user_id,
      email: r.email ?? '',
      nome: r.nome ?? '',
      financeiros: r.financeiro_ids ?? [],
    }))
  },

  // Marca/desmarca um financeiro para um membro (checkbox).
  async setAcesso(memberUserId: string, financeiroId: string, liberado: boolean): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    if (liberado) {
      const { error } = await (supabase.from('equipe_membros') as any).upsert(
        {
          owner_user_id: user.id,
          member_user_id: memberUserId,
          financeiro_id: financeiroId,
          papel: 'membro',
        },
        { onConflict: 'member_user_id,financeiro_id' },
      )
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('equipe_membros')
        .delete()
        .eq('owner_user_id', user.id)
        .eq('member_user_id', memberUserId)
        .eq('financeiro_id', financeiroId)
      if (error) throw error
    }
  },

  // Remove todos os acessos de um membro (remove da equipe).
  async removerMembro(memberUserId: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { error } = await supabase
      .from('equipe_membros')
      .delete()
      .eq('owner_user_id', user.id)
      .eq('member_user_id', memberUserId)
    if (error) throw error
  },

  // Remove um convidado que ainda não tem nenhum financeiro marcado:
  // apaga o login (auth) criado pela edge function. Sem vínculo em
  // equipe_membros, o RLS não permite deletar nada aqui; por isso a
  // remoção é feita pela edge function 'remover-usuario'.
  async removerConvidado(memberUserId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('remover-usuario', {
      body: { userId: memberUserId },
    })
    if (error) throw new Error(error.message)
    const payload = data as { error?: string } | null
    if (payload?.error) throw new Error(payload.error)
  },

  // Lista IDs dos financeiros liberados ao usuário logado (membro).
  async getFinanceirosLiberados(): Promise<string[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await supabase
      .from('equipe_membros')
      .select('financeiro_id')
      .eq('member_user_id', user.id)
    if (error) throw error
    return ((data as { financeiro_id: string }[]) || []).map((r) => r.financeiro_id)
  },

  // Tipagem auxiliar para o retorno do rpc (não muda o schema).
  __tipos: undefined as unknown as EquipeMembroAcesso[] | undefined,
}
