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

    const { data, error } = await supabase
      .from('equipe_membros')
      .select('member_user_id, financeiro_id')
      .eq('owner_user_id', user.id)
    if (error) throw error

    const rows = (data as { member_user_id: string; financeiro_id: string }[]) || []
    const porMembro = new Map<string, MembroEquipeView>()
    for (const r of rows) {
      if (!porMembro.has(r.member_user_id)) {
        porMembro.set(r.member_user_id, {
          member_user_id: r.member_user_id,
          email: '', // preenchido abaixo (via edge function, se disponível)
          nome: '',
          financeiros: [],
        })
      }
      porMembro.get(r.member_user_id)!.financeiros.push(r.financeiro_id)
    }

    // E-mails não são legíveis de auth.users pelo client público; o master
    // conhece os e-mails que convidou. Tentamos a RPC, se existir.
    try {
      const { data: emails, error: errRpc } = await (supabase as any).rpc('equipe_emails_membros')
      if (!errRpc && emails) {
        for (const e of emails as { user_id: string; email: string }[]) {
          const m = porMembro.get(e.user_id)
          if (m) m.email = e.email
        }
      }
    } catch {
      // rpc indisponível — mantém e-mail vazio
    }

    return Array.from(porMembro.values())
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
