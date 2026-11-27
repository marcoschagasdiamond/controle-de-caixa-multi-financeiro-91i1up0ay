import { supabase } from '@/lib/supabase/client'

export type PapelOrganizacao = 'admin' | 'membro'
export type ClassificacaoFinanceiro = 'propria' | 'cliente'

export interface Organizacao {
  id: string
  nome: string
  tipo: 'empresa' | 'escritorio' | null
  criada_por: string
  created_at: string
  updated_at: string
}

export interface OrganizacaoUsuario {
  user_id: string
  email: string | null
  nome: string | null
  papel: PapelOrganizacao
  created_at: string
}

export const FinanceiroOrganizacaoService = {
  /** Busca a(s) organização(ões) às quais o usuário logado pertence. */
  async listarMinhasOrganizacoes(): Promise<Organizacao[]> {
    const { data, error } = await supabase
      .from('organizacoes')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as Organizacao[]
  },

  /** Atualiza nome/tipo da organização (RLS exige admin). */
  async atualizarOrganizacao(
    id: string,
    valores: { nome: string; tipo: 'empresa' | 'escritorio' | null },
  ): Promise<void> {
    const { error } = await supabase
      .from('organizacoes')
      .update({ nome: valores.nome, tipo: valores.tipo })
      .eq('id', id)

    if (error) throw error
  },

  /** Cria uma nova organização; o criador entra como admin (trigger do banco). */
  async criarOrganizacao(nome: string, tipo: 'empresa' | 'escritorio'): Promise<Organizacao> {
    const { data, error } = await supabase
      .from('organizacoes')
      .insert({ nome, tipo, criada_por: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single()

    if (error) throw error
    return data as Organizacao
  },

  /** Lista os vínculos da organização com e-mail/nome (RPC SECURITY DEFINER). */
  async listarUsuarios(organizacaoId: string): Promise<OrganizacaoUsuario[]> {
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: object,
      ) => ReturnType<typeof supabase.rpc<'e_admin_organizacao'>>
    )('organizacao_listar_usuarios', {
      p_organizacao_id: organizacaoId,
    })

    if (error) throw error
    return (data ?? []) as unknown as OrganizacaoUsuario[]
  },

  /** Busca um usuário existente pelo e-mail exato (para vincular sem convidar). */
  async buscarUsuarioPorEmail(email: string): Promise<string | null> {
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: object,
      ) => ReturnType<typeof supabase.rpc<'e_admin_organizacao'>>
    )('equipe_buscar_usuario_por_email', {
      p_email: email,
    })

    if (error) throw error
    return (data as unknown as string | null) ?? null
  },

  /** Vincula um usuário existente à organização como membro (admin promove depois). */
  async adicionarUsuario(
    organizacaoId: string,
    userId: string,
    papel: PapelOrganizacao = 'membro',
  ): Promise<void> {
    const { error } = await supabase
      .from('organizacao_usuarios')
      .insert({ organizacao_id: organizacaoId, user_id: userId, papel })

    if (error) throw error
  },

  /** Promove/rebaixa o vínculo (admin ↔ membro). */
  async alterarPapel(vinculo: {
    organizacaoId: string
    userId: string
    papel: PapelOrganizacao
  }): Promise<void> {
    const { error } = await supabase
      .from('organizacao_usuarios')
      .update({ papel: vinculo.papel })
      .eq('organizacao_id', vinculo.organizacaoId)
      .eq('user_id', vinculo.userId)

    if (error) throw error
  },

  /** Remove o vínculo usuário ↔ organização. */
  async removerUsuario(organizacaoId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('organizacao_usuarios')
      .delete()
      .eq('organizacao_id', organizacaoId)
      .eq('user_id', userId)

    if (error) throw error
  },

  /** Marca/desmarca um financeiro como empresa de cliente dentro da organização. */
  async definirClassificacao(
    financeiroId: string,
    classificacao: ClassificacaoFinanceiro,
  ): Promise<void> {
    const { error } = await supabase
      .from('financeiros')
      .update({ classificacao } as never)
      .eq('id', financeiroId)

    if (error) throw error
  },
}
